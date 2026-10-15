import { registerTool } from "./register.js";
import type { McpServer } from "@modelcontextprotocol/server";
import os from "node:os";
import si from "systeminformation";
import { cachedCollector, withTimeout } from "../collectors.js";

const collectNetworkSpeed = cachedCollector(async () => {
    await withTimeout(si.networkStats("*"), 15000);
    const startedAt = Date.now();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const [stats, adapters] = await withTimeout(Promise.all([si.networkStats("*"), si.networkInterfaces()]), 15000);
    const loopbacks = new Set(adapters.filter(adapter => adapter.internal).map(adapter => adapter.iface));
    const interfaces = stats.filter(iface => iface.iface && !loopbacks.has(iface.iface)
        && Number.isFinite(iface.rx_sec) && Number.isFinite(iface.tx_sec) && iface.rx_sec >= 0 && iface.tx_sec >= 0)
        .map(iface => ({
            interface: iface.iface,
            downloadKBps: Number((iface.rx_sec / 1024).toFixed(2)),
            uploadKBps: Number((iface.tx_sec / 1024).toFixed(2)),
            downloadMbps: Number((iface.rx_sec * 8 / 1_000_000).toFixed(2)),
            uploadMbps: Number((iface.tx_sec * 8 / 1_000_000).toFixed(2)),
            totalReceivedMB: Number((iface.rx_bytes / 1024 ** 2).toFixed(2)),
            totalSentMB: Number((iface.tx_bytes / 1024 ** 2).toFixed(2))
        }));
    const busiest = [...interfaces].sort((a, b) => b.downloadKBps + b.uploadKBps - a.downloadKBps - a.uploadKBps)[0];
    return { samplingIntervalMs: 1000, elapsedMs: Date.now() - startedAt, sampledAt: new Date().toISOString(),
        source: "systeminformation.networkStats", measurementStatus: interfaces.length ? "available" : "unavailable",
        units: { downloadKBps: "KiB/s", uploadKBps: "KiB/s", throughput: "Mbps" },
        busiestInterface: busiest?.interface ?? "N/A", interfaces };
}, 250);

export function registerNetworkTools(server: McpServer) {
    registerTool(server,
        "get_network_info",
        {
            description: "Inspect local network interface cards (NICs), IP routing addresses, and network topology. Groups interfaces into active external network adapters (Ethernet, Wi-Fi, virtual bridges) and internal loopback interfaces, returning IPv4/IPv6 addresses, subnet families, hardware MAC addresses, and scope flags. Use to determine host IP addresses, network interface configuration, and local connectivity."
        },
        async () => {
            try {
                const nets = os.networkInterfaces();
                const external: Record<string, any[]> = {};
                const loopback: Record<string, any[]> = {};

                for (const name of Object.keys(nets)) {
                    const netList = nets[name];
                    if (!netList) continue;

                    const mapped = netList.map((net) => ({
                        address: net.address,
                        family: net.family,
                        mac: net.mac,
                        internal: net.internal
                    }));

                    // Separate external interfaces from loopback
                    if (netList.some((net) => !net.internal)) {
                        external[name] = mapped;
                    } else {
                        loopback[name] = mapped;
                    }
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ external, loopback }, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving network information: ${err.message}`
                        }
                    ]
                };
            }
        }
    );

    registerTool(server,
        "get_network_speed",
        {
            description: "Perform real-time network throughput and bandwidth telemetry by sampling transfer rates over a 1-second interval. Returns per-interface download and upload transfer speeds in both Kilobytes/sec (KB/s) and Megabits/sec (Mbps), cumulative received and transmitted data in Megabytes (MB), and identifies the busiest network interface. Use to diagnose network congestion, active bandwidth hogging, or measure current transfer speeds."
        },
        async () => {
            try {
                const speed = await collectNetworkSpeed();

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(speed, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving network speed: ${err.message}`
                        }
                    ]
                };
            }
        }
    );
}
