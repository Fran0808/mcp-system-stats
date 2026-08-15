import type { McpServer } from "@modelcontextprotocol/server";
import os from "node:os";
import si from "systeminformation";

export function registerNetworkTools(server: McpServer) {
    server.registerTool(
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

    server.registerTool(
        "get_network_speed",
        {
            description: "Perform real-time network throughput and bandwidth telemetry by sampling transfer rates over a 1-second interval. Returns per-interface download and upload transfer speeds in both Kilobytes/sec (KB/s) and Megabits/sec (Mbps), cumulative received and transmitted data in Megabytes (MB), and identifies the busiest network interface. Use to diagnose network congestion, active bandwidth hogging, or measure current transfer speeds."
        },
        async () => {
            try {
                await si.networkStats();
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const stats = await si.networkStats();

                // Filter out loopback and virtual interfaces with no activity
                const activeInterfaces = stats.filter(
                    (iface) => !iface.iface.toLowerCase().includes("lo") && iface.iface !== "" && (iface.rx_sec >= 0 && iface.tx_sec >= 0)
                );

                const interfaces = activeInterfaces.map((iface) => {
                    const downloadKBps = Number((iface.rx_sec / 1024).toFixed(2));
                    const uploadKBps = Number((iface.tx_sec / 1024).toFixed(2));

                    return {
                        interface: iface.iface,
                        downloadKBps,
                        uploadKBps,
                        downloadMbps: Number((downloadKBps / 125).toFixed(2)),
                        uploadMbps: Number((uploadKBps / 125).toFixed(2)),
                        totalReceivedMB: Number((iface.rx_bytes / (1024 ** 2)).toFixed(2)),
                        totalSentMB: Number((iface.tx_bytes / (1024 ** 2)).toFixed(2))
                    };
                });

                const busiest = interfaces.length > 0
                    ? interfaces.reduce((prev, curr) =>
                        (curr.downloadKBps + curr.uploadKBps) > (prev.downloadKBps + prev.uploadKBps) ? curr : prev
                    )
                    : null;

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                samplingIntervalMs: 1000,
                                busiestInterface: busiest?.interface ?? "N/A",
                                interfaces
                            }, null, 2)
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
