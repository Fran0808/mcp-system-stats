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
}
