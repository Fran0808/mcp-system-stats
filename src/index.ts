#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import os from "node:os";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

export const server = new McpServer({
    name: "system-stats",
    version: "1.0.0"
})


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
)
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
    
)
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
server.registerTool(
    "get_top_processes",
    {
        description: "Use this tool whenever the user asks about top processes, heavy applications, or which programs are consuming the most CPU or RAM memory on their local computer.",
        inputSchema: z.object({
            sortBy: z.enum(["cpu", "memory"]).optional().default("cpu"),
            limit: z.number().optional().default(5)
        })
    },
    async ({ sortBy, limit }) => {
        try {
            const processesData = await si.processes();

            // Sort processes descending by CPU or memory
            const sortedList = [...processesData.list].sort((a, b) => {
                if (sortBy === "memory") {
                    return b.memRss - a.memRss;
                }
                return b.cpu - a.cpu;
            });

            const activeList = sortedList.filter((p) =>
                sortBy === "memory" ? p.memRss > 0 : p.cpu > 0 || p.memRss > 0
            );

            // Take the top N processes and format output
            const topProcesses = activeList.slice(0, limit).map((p) => ({
                pid: p.pid,
                name: p.name,
                cpuPercentage: Number(p.cpu.toFixed(2)) + "%",
                memoryMB: Number((p.memRss / 1024).toFixed(2))
            }));

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ sortBy, count: topProcesses.length, processes: topProcesses }, null, 2)
                    }
                ]
            };
        } catch (err: any) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error retrieving top processes: ${err.message}`
                    }
                ]
            };
        }
    }
);
server.registerTool(
    "get_network_info",
    {
        description: "Use this tool whenever the user asks about their local computer network interfaces, IP addresses (IPv4/IPv6), MAC address, or network connectivity details."
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
    "search_process",
    {
        description: "Use this tool whenever the user asks if a specific program, application, service, or process (e.g. 'chrome', 'node', 'docker', 'vscode', 'spotify') is currently running on their local computer.",
        inputSchema: z.object({
            name: z.string()
        })
    },
    async ({ name }) => {
        try {
            const processesData = await si.processes();

            const matches = processesData.list.filter((p) =>
                p.name.toLowerCase().includes(name.toLowerCase())
            );

            if (matches.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                query: name,
                                isRunning: false,
                                message: `No active processes found matching '${name}'.`
                            }, null, 2)
                        }
                    ]
                };
            }

            const totalCpu = matches.reduce((sum, p) => sum + p.cpu, 0);
            const totalMemoryKB = matches.reduce((sum, p) => sum + p.memRss, 0);

            const instances = matches.map((p) => ({
                pid: p.pid,
                name: p.name,
                cpuPercentage: Number(p.cpu.toFixed(2)) + "%",
                memoryMB: Number((p.memRss / 1024).toFixed(2))
            }));

            const searchResult = {
                query: name,
                isRunning: true,
                count: matches.length,
                totalCpuPercentage: Number(totalCpu.toFixed(2)) + "%",
                totalMemoryMB: Number((totalMemoryKB / 1024).toFixed(2)),
                instances
            };

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(searchResult, null, 2)
                    }
                ]
            };
        } catch (err: any) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error searching for process '${name}': ${err.message}`
                    }
                ]
            };
        }
    }
);
server.registerTool(
    "get_gpu_stats",
    {
        description: "Use this tool whenever the user asks about their local computer graphics card (GPU), VRAM memory, GPU utilization, GPU temperature, monitors, or display setup."
    },
    async () => {
        try {
            const graphicsData = await si.graphics();

            const gpus = graphicsData.controllers.map((gpu) => ({
                model: gpu.model || "Unknown",
                vendor: gpu.vendor || "Unknown",
                vramMB: gpu.vram !== null && gpu.vram !== undefined ? gpu.vram : "N/A",
                utilizationGpuPercentage: gpu.utilizationGpu !== null && gpu.utilizationGpu !== undefined ? gpu.utilizationGpu + "%" : "N/A",
                temperatureC: gpu.temperatureGpu !== null && gpu.temperatureGpu !== undefined ? gpu.temperatureGpu + "°C" : "N/A",
                bus: gpu.bus || "N/A"
            }));

            const displays = graphicsData.displays.map((d) => ({
                model: d.model || "Unknown",
                vendor: d.vendor || "Unknown",
                resolutionX: d.resolutionX ?? "N/A",
                resolutionY: d.resolutionY ?? "N/A",
                currentResolution: d.resolutionX && d.resolutionY ? `${d.resolutionX}x${d.resolutionY}` : "N/A",
                refreshRateHz: d.currentRefreshRate ?? "N/A",
                connection: d.connection || "N/A",
                main: d.main ?? false
            }));

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            { gpuCount: gpus.length, gpus, displayCount: displays.length, displays },
                            null, 2
                        )
                    }
                ]
            };
        } catch (err: any) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error retrieving GPU statistics: ${err.message}`
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

            // Unified thresholds: CRITICAL >= 90%, WARNING >= 75%
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
async function getWindowsCpuTemp(): Promise<{ mainC: number | null; perCore: Array<{ core: number; tempC: string }>; source: string }> {
    if (os.platform() !== "win32") return { mainC: null, perCore: [], source: "N/A" };

    try {
        const psScript = `
            try {
                $lhm = Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction Stop | Where-Object SensorType -eq 'Temperature' | Select-Object Name, Value;
                if ($lhm) { ConvertTo-Json -InputObject @{ type='LHM'; data=$lhm }; exit }
            } catch {}
            try {
                $tz = Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop | Select-Object -ExpandProperty Temperature;
                if ($tz) { ConvertTo-Json -InputObject @{ type='TZ'; temp=$tz }; exit }
            } catch {}
        `;

        const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-NoLogo", "-Command", psScript], { timeout: 3000 });

        if (stdout && stdout.trim()) {
            const result = JSON.parse(stdout.trim());
            if (result.type === "LHM" && result.data) {
                const list = Array.isArray(result.data) ? result.data : [result.data];
                const cpuCoreSensors = list.filter((s: any) => s.Name && s.Name.toLowerCase().includes("cpu core"));
                if (cpuCoreSensors.length > 0) {
                    const perCore = cpuCoreSensors.map((s: any, idx: number) => ({
                        core: idx,
                        tempC: `${Math.round(s.Value)}°C`
                    }));
                    const avgTemp = Number((cpuCoreSensors.reduce((acc: number, s: any) => acc + s.Value, 0) / cpuCoreSensors.length).toFixed(1));
                    return { mainC: avgTemp, perCore, source: "LibreHardwareMonitor WMI" };
                }
            } else if (result.type === "TZ" && result.temp !== undefined) {
                const rawKelvin = Array.isArray(result.temp) ? parseFloat(result.temp[0]) : parseFloat(result.temp);
                if (!isNaN(rawKelvin) && rawKelvin > 200) {
                    const celsius = Number((rawKelvin - 273.15).toFixed(1));
                    return { mainC: celsius, perCore: [], source: "Windows Thermal Zone Performance Counter" };
                }
            }
        }
    } catch {
        // Fallback gracefully
    }

    return { mainC: null, perCore: [], source: "N/A" };
}

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
    "get_network_speed",
    {
        description: "Use this tool whenever the user asks about their current internet speed, network bandwidth usage, download or upload speed, or which network interface is consuming bandwidth."
    },
    async () => {
        try {
            // Take two samples 1 second apart to calculate real-time speed
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
async function main(){
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server MCP running successfully")

}
if (process.env.NODE_ENV !== "test") {
    main().catch((error) => {
        console.error("Fatal error in main():", error);
        process.exit(1);
    });
}