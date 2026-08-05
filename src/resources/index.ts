import type { McpServer } from "@modelcontextprotocol/server";
import os from "node:os";
import si from "systeminformation";

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

            let cpuLoadPercentage = "0%";
            try {
                const loadData = await si.currentLoad();
                cpuLoadPercentage = Number(loadData.currentLoad.toFixed(2)) + "%";
            } catch {
                // fallback
            }

            const totalRamGB = Number((os.totalmem() / (1024 ** 3)).toFixed(2));
            const freeRamGB = Number((os.freemem() / (1024 ** 3)).toFixed(2));

            const overview = {
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
            description: "Real-time diagnostic health check status (HEALTHY, WARNING, CRITICAL) with CPU/RAM pressure alerts.",
            mimeType: "application/json"
        },
        async (uri) => {
            let cpuLoad = 0;
            try {
                const loadData = await si.currentLoad();
                cpuLoad = Number(loadData.currentLoad.toFixed(2));
            } catch {
                // fallback
            }

            const totalRam = os.totalmem();
            const freeRam = os.freemem();
            const usedRam = totalRam - freeRam;
            const ramLoad = Number(((usedRam / totalRam) * 100).toFixed(2));

            const alerts: string[] = [];
            let status: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";

            if (cpuLoad >= 90 || ramLoad >= 90) {
                status = "CRITICAL";
            } else if (cpuLoad >= 75 || ramLoad >= 75) {
                status = "WARNING";
            }

            if (cpuLoad >= 90) {
                alerts.push(`CRITICAL: CPU utilization is very high (${cpuLoad}%).`);
            } else if (cpuLoad >= 75) {
                alerts.push(`WARNING: CPU utilization is elevated (${cpuLoad}%).`);
            }
            if (ramLoad >= 90) {
                alerts.push(`CRITICAL: RAM memory utilization is very high (${ramLoad}%).`);
            } else if (ramLoad >= 75) {
                alerts.push(`WARNING: RAM memory utilization is elevated (${ramLoad}%).`);
            }
            if (alerts.length === 0) {
                alerts.push("System is operating normally within optimal parameters.");
            }

            const healthReport = {
                status,
                cpuLoadPercentage: cpuLoad + "%",
                ramLoadPercentage: ramLoad + "%",
                totalRamGB: Number((totalRam / (1024 ** 3)).toFixed(2)),
                freeRamGB: Number((freeRam / (1024 ** 3)).toFixed(2)),
                uptimeSeconds: Math.floor(os.uptime()),
                alerts
            };

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
            const [baseboard, bios, memLayout, diskLayout, systemData, graphicsData] = await Promise.all([
                si.baseboard(),
                si.bios(),
                si.memLayout(),
                si.diskLayout(),
                si.system(),
                si.graphics()
            ]);

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
            const uptimeSeconds = Math.floor(os.uptime());
            const days = Math.floor(uptimeSeconds / 86400);
            const hours = Math.floor((uptimeSeconds % 86400) / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
            const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

            let cpuLoad = 0;
            try {
                const loadData = await si.currentLoad();
                cpuLoad = Number(loadData.currentLoad.toFixed(2));
            } catch {
                // fallback
            }

            const totalRam = os.totalmem();
            const freeRam = os.freemem();
            const usedRam = totalRam - freeRam;
            const ramLoad = Number(((usedRam / totalRam) * 100).toFixed(2));
            const totalRamGB = (totalRam / (1024 ** 3)).toFixed(2);
            const freeRamGB = (freeRam / (1024 ** 3)).toFixed(2);
            const usedRamGB = (usedRam / (1024 ** 3)).toFixed(2);

            let status: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
            if (cpuLoad >= 90 || ramLoad >= 90) status = "CRITICAL";
            else if (cpuLoad >= 75 || ramLoad >= 75) status = "WARNING";

            const markdown = [
                `# 🖥️ System Live Stats Dashboard`,
                ``,
                `**Status:** \`${status}\` | **Uptime:** \`${uptimeFormatted}\` | **Hostname:** \`${os.hostname()}\``,
                ``,
                `## ⚙️ Operating System & Hardware`,
                `- **OS Platform:** ${os.platform()} (${os.type()} ${os.release()} ${os.arch()})`,
                `- **CPU Model:** ${cpus.length > 0 ? cpus[0].model : "Unknown"} (${cpus.length} cores)`,
                `- **CPU Load:** \`${cpuLoad}%\``,
                `- **RAM Memory:** \`${usedRamGB} GB / ${totalRamGB} GB\` used (\`${ramLoad}%\` load, \`${freeRamGB} GB\` free)`,
                ``,
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
