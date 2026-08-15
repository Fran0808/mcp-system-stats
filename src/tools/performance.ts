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
            description: "Retrieve comprehensive CPU performance metrics and thermal telemetry. Returns processor model, logical cores, physical cores, current/min/max clock speeds (GHz), total and breakdown load (user, system, idle percentages), per-core utilization percentages, main and max package temperatures (°C), thermal health status ('NORMAL' <75°C, 'HOT' 75-89°C, 'CRITICAL' >=90°C), temperature sensor source, and individual per-core temperatures when available. Use to diagnose thermal throttling or compute bottlenecks."
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
            description: "Retrieve precise physical RAM utilization metrics. Returns total system RAM, free available RAM, used RAM, and memory utilization percentage in either GB or MB. Use this to analyze memory saturation, check headroom for large workloads, or assess RAM pressure.",
            inputSchema: z.object({
                unit: z.enum(["GB", "MB"]).optional().default("GB").describe("Unit of measurement for RAM output values: 'GB' for gigabytes (default) or 'MB' for megabytes.")
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
            description: "Retrieve storage capacity and free space metrics for a specified drive path or mount point. Returns total capacity (GB), free space (GB), used space (GB), and utilization percentage. Use to identify low-disk-space warnings (>85% utilized) and verify available storage for software installations or large downloads.",
            inputSchema: z.object({
                path: z.string().optional().default(os.platform() === "win32" ? "C:\\" : "/").describe("File system path or drive letter to inspect (e.g. 'C:\\\\', 'D:\\\\', or '/'). Defaults to the primary system root drive.")
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
