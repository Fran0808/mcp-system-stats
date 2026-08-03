import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import os from "node:os";
import fs from "node:fs";
import si from "systeminformation";
import { getWindowsCpuTemp } from "./helpers.js";

export function registerPerformanceTools(server: McpServer) {
    server.registerTool(
        "get_cpu_stats",
        {
            description: "Use this tool whenever the user asks about their CPU usage, CPU load per core, CPU temperature, CPU speed, or wants a complete overview of their processor performance."
        },
        async () => {
            try {
                const [loadData, tempData, cpuData] = await Promise.all([
                    si.currentLoad(),
                    si.cpuTemperature(),
                    si.cpu()
                ]);

                // Per-core load
                const coreLoads = loadData.cpus.map((core, index) => ({
                    core: index,
                    loadPercentage: Number(core.load.toFixed(2)) + "%"
                }));

                // Per-core temperature
                let coreTemps = tempData.cores && tempData.cores.length > 0
                    ? tempData.cores.map((temp, index) => ({
                        core: index,
                        tempC: temp !== null ? temp + "°C" : "N/A"
                    }))
                    : [];

                let mainTemp = tempData.main ?? null;
                let tempSource = "System Information API";

                if ((mainTemp === null || mainTemp === undefined || mainTemp === 0) && os.platform() === "win32") {
                    const winTemp = await getWindowsCpuTemp();
                    if (winTemp.mainC !== null) {
                        mainTemp = winTemp.mainC;
                        tempSource = winTemp.source;
                        if (winTemp.perCore.length > 0) {
                            coreTemps = winTemp.perCore;
                        }
                    }
                }

                let tempStatus: "NORMAL" | "HOT" | "CRITICAL" | "Unavailable" = "Unavailable";
                if (mainTemp !== null && mainTemp > 0) {
                    if (mainTemp >= 90) tempStatus = "CRITICAL";
                    else if (mainTemp >= 75) tempStatus = "HOT";
                    else tempStatus = "NORMAL";
                }

                let calculatedMaxC = tempData.max !== null && tempData.max !== undefined && tempData.max > 0 ? tempData.max : null;
                if (calculatedMaxC === null && coreTemps.length > 0) {
                    const numericTemps = coreTemps
                        .map(c => parseFloat(c.tempC))
                        .filter(t => !isNaN(t));
                    if (numericTemps.length > 0) {
                        calculatedMaxC = Math.max(...numericTemps);
                    }
                }
                if (calculatedMaxC === null && mainTemp !== null && mainTemp > 0) {
                    calculatedMaxC = mainTemp;
                }

                const cpuStats = {
                    model: cpuData.manufacturer + " " + cpuData.brand,
                    cores: cpuData.cores,
                    physicalCores: cpuData.physicalCores,
                    speedGHz: {
                        current: cpuData.speed ?? "N/A",
                        min: cpuData.speedMin ?? "N/A",
                        max: cpuData.speedMax ?? "N/A"
                    },
                    load: {
                        totalPercentage: Number(loadData.currentLoad.toFixed(2)) + "%",
                        userPercentage: Number(loadData.currentLoadUser.toFixed(2)) + "%",
                        systemPercentage: Number(loadData.currentLoadSystem.toFixed(2)) + "%",
                        idlePercentage: Number(loadData.currentLoadIdle.toFixed(2)) + "%",
                        perCore: coreLoads
                    },
                    temperature: {
                        mainC: mainTemp !== null && mainTemp > 0 ? mainTemp + "°C" : "N/A",
                        maxC: calculatedMaxC !== null ? calculatedMaxC + "°C" : "N/A",
                        status: tempStatus,
                        sensorSource: mainTemp !== null && mainTemp > 0 ? tempSource : "Unavailable",
                        perCore: coreTemps
                    }
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(cpuStats, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving CPU statistics: ${err.message}`
                        }
                    ]
                };
            }
        }
    );

    server.registerTool(
        "get_memory_status",
        {
            description: "Use this tool whenever the user asks about their local computer RAM memory usage, available RAM, free RAM, or memory performance.",
            inputSchema: z.object({
                unit: z.enum(["GB", "MB"]).optional().default("GB")
            })
        },
        async ({ unit }) => {
            const totalBytes = os.totalmem();
            const freeBytes = os.freemem();
            const usedBytes = totalBytes - freeBytes;

            const divisor = unit === "GB" ? 1024 ** 3 : 1024 ** 2;

            const memoryStats = {
                unit,
                total: Number((totalBytes / divisor).toFixed(2)),
                free: Number((freeBytes / divisor).toFixed(2)),
                used: Number((usedBytes / divisor).toFixed(2)),
                usedPercentage: Number(((usedBytes / totalBytes) * 100).toFixed(2)) + "%"
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(memoryStats, null, 2)
                    }
                ]
            }
        }
    );

    server.registerTool(
        "get_disk_space",
        {
            description: "Use this tool whenever the user asks about their local computer disk space, hard drive storage, or free space on drive C or root.",
            inputSchema: z.object({
                path: z.string().optional().default(os.platform() === "win32" ? "C:\\" : "/")
            })
        },
        async ({ path }) => {
            try {
                const stats = await fs.promises.statfs(path);
                const totalBytes = stats.bsize * stats.blocks;
                const freeBytes = stats.bsize * stats.bfree;
                const usedBytes = totalBytes - freeBytes;

                const diskStats = {
                    path,
                    totalGB: Number((totalBytes / (1024 ** 3)).toFixed(2)),
                    freeGB: Number((freeBytes / (1024 ** 3)).toFixed(2)),
                    usedGB: Number((usedBytes / (1024 ** 3)).toFixed(2)),
                    usedPercentage: Number(((usedBytes / totalBytes) * 100).toFixed(2)) + "%"
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(diskStats, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error reading disk space for path "${path}": ${err.message}`
                        }
                    ]
                };
            }
        }
    );
}
