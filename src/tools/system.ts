import type { McpServer } from "@modelcontextprotocol/server";
import os from "node:os";
import si from "systeminformation";

export function registerSystemTools(server: McpServer) {
    server.registerTool(
        "get_system_overview",
        {
            description: "Use this tool whenever the user asks about their local operating system, local OS name/version, CPU specifications, hardware info, hostname, system uptime, or current CPU usage."
        },
        async () => {
            try {
                const cpus = os.cpus();
                const uptimeSeconds = Math.floor(os.uptime());

                const days = Math.floor(uptimeSeconds / 86400);
                const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

                // Get real-time CPU load
                const loadData = await si.currentLoad();
                const cpuLoadPercentage = Number(loadData.currentLoad.toFixed(2)) + "%";

                const overview = {
                    platform: os.platform(),
                    type: os.type(),
                    release: os.release(),
                    arch: os.arch(),
                    cpuModel: cpus.length > 0 ? cpus[0].model : "Unknown",
                    cpuCores: cpus.length,
                    cpuLoadPercentage,
                    hostname: os.hostname(),
                    username: os.userInfo().username,
                    uptimeSeconds,
                    uptimeFormatted
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(overview, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving system overview: ${err.message}`
                        }
                    ]
                };
            }
        }
    );

    server.registerTool(
        "get_system_health",
        {
            description: "Use this tool whenever the user asks for a complete diagnostic, health check, system performance status, or overall health of their local computer."
        },
        async () => {
            try {
                // Get real-time CPU load
                const loadData = await si.currentLoad();
                const cpuLoad = Number(loadData.currentLoad.toFixed(2));

                // Get real-time RAM load
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
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(healthReport, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error conducting system health diagnostic: ${err.message}`
                        }
                    ]
                };
            }
        }
    );

    server.registerTool(
        "get_battery_status",
        {
            description: "Use this tool whenever the user asks about their laptop battery percentage, battery health, charging state, or remaining time."
        },
        async () => {
            try {
                const batteryData = await si.battery();

                if (!batteryData.hasBattery) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    hasBattery: false,
                                    message: "No battery detected on this system (desktop PC or battery driver unavailable)."
                                }, null, 2)
                            }
                        ]
                    };
                }

                const batteryStatus = {
                    hasBattery: true,
                    percent: batteryData.percent + "%",
                    isCharging: batteryData.isCharging,
                    acConnected: batteryData.acConnected,
                    timeRemainingMinutes: batteryData.timeRemaining !== null && batteryData.timeRemaining > 0 ? batteryData.timeRemaining : "AC Connected / Calculating",
                    maxCapacity: batteryData.maxCapacity,
                    designedCapacity: batteryData.designedCapacity,
                    healthPercentage: batteryData.designedCapacity > 0 && batteryData.maxCapacity > 0
                        ? Number(((batteryData.maxCapacity / batteryData.designedCapacity) * 100).toFixed(2)) + "%"
                        : "N/A",
                    type: batteryData.type || "N/A"
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(batteryStatus, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving battery status: ${err.message}`
                        }
                    ]
                };
            }
        }
    );
}
