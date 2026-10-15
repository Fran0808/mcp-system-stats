import { getSystemSnapshot, getHardwareSnapshot, formatUptime } from "../collectors.js";
import type { McpServer } from "@modelcontextprotocol/server";
import os from "node:os";

export function registerAllResources(server: McpServer) {
    server.registerResource(
        "system-overview",
        "system://overview",
        {
            description: "Real-time summary of operating system, CPU model, core counts, RAM, uptime, and general hardware identity.",
            mimeType: "application/json"
        },
        async (uri) => {
            const cpus = os.cpus();
            const uptimeSeconds = Math.floor(os.uptime());

            const days = Math.floor(uptimeSeconds / 86400);
            const hours = Math.floor((uptimeSeconds % 86400) / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
            const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

            const snapshot = await getSystemSnapshot();
            const { cpuLoadPercentage, totalRamGB, freeRamGB } = snapshot;

            const overview = {
                sampledAt: snapshot.sampledAt,
                measurementStatus: snapshot.measurementStatus,
                source: snapshot.source,
                platform: os.platform(),
                type: os.type(),
                release: os.release(),
                arch: os.arch(),
                cpuModel: cpus.length > 0 ? cpus[0].model : "Unknown",
                cpuCores: cpus.length,
                cpuLoadPercentage,
                totalRamGB,
                freeRamGB,
                hostname: os.hostname(),
                username: os.userInfo().username,
                uptimeSeconds,
                uptimeFormatted
            };

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(overview, null, 2)
                    }
                ]
            };
        }
    );

    server.registerResource(
        "system-health",
        "system://health",
        {
            description: "Real-time diagnostic health check status (HEALTHY, WARNING, CRITICAL, UNKNOWN) with CPU/RAM pressure alerts.",
            mimeType: "application/json"
        },
        async (uri) => {
            const healthReport = await getSystemSnapshot();

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(healthReport, null, 2)
                    }
                ]
            };
        }
    );

    server.registerResource(
        "system-hardware",
        "system://hardware",
        {
            description: "Detailed hardware specs inventory including motherboard, BIOS, physical RAM sticks layout, SSD/HDD storage drives, and GPU controllers.",
            mimeType: "application/json"
        },
        async (uri) => {
            const { baseboard, bios, memLayout, diskLayout, systemData, graphicsData, sampledAt } = await getHardwareSnapshot();

            const motherboard = {
                manufacturer: baseboard.manufacturer || "Unknown",
                model: baseboard.model || "Unknown",
                version: baseboard.version || "N/A",
                bios: {
                    vendor: bios.vendor || "Unknown",
                    version: bios.version || "Unknown",
                    releaseDate: bios.releaseDate || "N/A"
                }
            };

            const systemModel = {
                manufacturer: systemData.manufacturer || "Unknown",
                model: systemData.model || "Unknown",
                sku: systemData.sku || "N/A"
            };

            const ramSticks = memLayout.map((stick) => ({
                sizeGB: Number((stick.size / (1024 ** 3)).toFixed(2)),
                type: stick.type || "Unknown",
                clockSpeedMHz: stick.clockSpeed || "N/A",
                manufacturer: stick.manufacturer || "Unknown",
                partNum: stick.partNum ? stick.partNum.trim() : "N/A"
            }));

            const storageDrives = diskLayout.map((disk) => ({
                device: disk.device || "Unknown",
                name: disk.name || "Unknown",
                vendor: disk.vendor || "Unknown",
                sizeGB: Number((disk.size / (1024 ** 3)).toFixed(2)),
                type: disk.type || "Unknown",
                interfaceType: disk.interfaceType || "N/A"
            }));

            const gpus = graphicsData.controllers.map((gpu) => ({
                model: gpu.model || "Unknown",
                vendor: gpu.vendor || "Unknown",
                vramMB: gpu.vram !== null && gpu.vram !== undefined ? gpu.vram : "N/A"
            }));

            const hardwareInventory = {
                sampledAt,
                source: "systeminformation",
                measurementStatus: ramSticks.length && storageDrives.length ? "available" : "partial",
                measurements: {
                    memoryLayout: ramSticks.length ? "available" : "unavailable",
                    storageLayout: storageDrives.length ? "available" : "unavailable"
                },
                systemModel,
                motherboard,
                ram: {
                    totalSticks: ramSticks.length,
                    sticks: ramSticks
                },
                storage: {
                    totalDrives: storageDrives.length,
                    drives: storageDrives
                },
                graphics: {
                    totalGPUs: gpus.length,
                    gpus
                }
            };

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(hardwareInventory, null, 2)
                    }
                ]
            };
        }
    );

    server.registerResource(
        "system-live-stats",
        "system://live-stats",
        {
            description: "Live system dashboard formatted in Markdown for direct LLM context injection.",
            mimeType: "text/markdown"
        },
        async (uri) => {
            const cpus = os.cpus();
            const snapshot = await getSystemSnapshot();
            const { status, cpuLoadPercentage, ramLoadPercentage, totalRamGB, freeRamGB } = snapshot;
            const uptimeFormatted = formatUptime(snapshot.uptimeSeconds);
            const usedRamGB = (totalRamGB - freeRamGB).toFixed(2);

            const markdown = [
                `# System Live Stats Dashboard`,
                ``,
                `**Status:** \`${status}\` | **Uptime:** \`${uptimeFormatted}\` | **Hostname:** \`${os.hostname()}\``,
                ``,
                `## Operating System & Hardware`,
                `- **OS Platform:** ${os.platform()} (${os.type()} ${os.release()} ${os.arch()})`,
                `- **CPU Model:** ${cpus.length > 0 ? cpus[0].model : "Unknown"} (${cpus.length} cores)`,
                `- **CPU Load:** \`${cpuLoadPercentage ?? "Unavailable"}\``,
                `- **RAM Memory:** \`${usedRamGB} GB / ${totalRamGB} GB\` used (\`${ramLoadPercentage ?? "Unavailable"}\` load, \`${freeRamGB} GB\` free)`,
                ``,
                `**Sampled at:** ${snapshot.sampledAt} | **Measurements:** ${snapshot.measurementStatus}`,
                ...snapshot.alerts.map(alert => `- ${alert}`),
                `---`,
                `*Report generated live by @fran0808/system-stats MCP Server.*`
            ].join("\n");

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/markdown",
                        text: markdown
                    }
                ]
            };
        }
    );
}
