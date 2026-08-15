import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import si from "systeminformation";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export function registerProcessTools(server: McpServer) {
    server.registerTool(
        "get_top_processes",
        {
            description: "Identify and rank resource-intensive applications and processes currently running on the local computer. Can sort by real-time CPU consumption percentage or physical RAM memory usage (MB), group multiple instances of the same application (e.g. multi-process browsers, Discord, Electron apps) into unified entries with instance counts and PID arrays, or return individual granular PID processes. Use to diagnose system slowdowns, high CPU spikes, and memory leaks.",
            inputSchema: z.object({
                sortBy: z.enum(["cpu", "memory"]).optional().default("cpu").describe("Metric used to sort the top processes: 'cpu' for highest processor utilization or 'memory' for highest physical RAM usage."),
                limit: z.number().min(1).max(50).optional().default(5).describe("Number of top resource-consuming applications/processes to return (1 to 50, default: 5)."),
                groupByApp: z.boolean().optional().default(true).describe("Whether to aggregate multiple sub-processes with the same executable name into a single combined entry (default: true). Set to false to inspect individual PIDs.")
            })
        },
        async ({ sortBy, limit, groupByApp }) => {
            try {
                const processesData = await si.processes();

                if (groupByApp) {
                    const groupedMap = new Map<string, {
                        name: string;
                        instances: number;
                        totalMemoryKB: number;
                        totalCpu: number;
                        pids: number[];
                    }>();

                    for (const p of processesData.list) {
                        if (p.memRss <= 0 && p.cpu <= 0) continue;

                        const key = p.name.toLowerCase();
                        const existing = groupedMap.get(key);

                        if (existing) {
                            existing.instances += 1;
                            existing.totalMemoryKB += p.memRss;
                            existing.totalCpu += p.cpu;
                            if (existing.pids.length < 5) existing.pids.push(p.pid);
                        } else {
                            groupedMap.set(key, {
                                name: p.name,
                                instances: 1,
                                totalMemoryKB: p.memRss,
                                totalCpu: p.cpu,
                                pids: [p.pid]
                            });
                        }
                    }

                    const apps = Array.from(groupedMap.values());
                    apps.sort((a, b) => {
                        if (sortBy === "memory") {
                            return b.totalMemoryKB - a.totalMemoryKB;
                        }
                        return b.totalCpu - a.totalCpu;
                    });

                    const topProcesses = apps.slice(0, limit).map((app) => ({
                        name: app.name,
                        instances: app.instances,
                        totalMemoryMB: Number((app.totalMemoryKB / 1024).toFixed(2)),
                        totalCpuPercentage: Number(app.totalCpu.toFixed(2)) + "%",
                        pids: app.pids
                    }));

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({ sortBy, groupedByApp: true, count: topProcesses.length, processes: topProcesses }, null, 2)
                            }
                        ]
                    };
                } else {
                    const sortedList = [...processesData.list].sort((a, b) => {
                        if (sortBy === "memory") {
                            return b.memRss - a.memRss;
                        }
                        return b.cpu - a.cpu;
                    });

                    const activeList = sortedList.filter((p) =>
                        sortBy === "memory" ? p.memRss > 0 : p.cpu > 0 || p.memRss > 0
                    );

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
                                text: JSON.stringify({ sortBy, groupedByApp: false, count: topProcesses.length, processes: topProcesses }, null, 2)
                            }
                        ]
                    };
                }
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
        "search_process",
        {
            description: "Search and inspect running processes by name or substring query (e.g. 'chrome', 'node', 'docker', 'python', 'ollama'). Returns whether matching processes are actively running, total count of active instances, aggregated CPU utilization percentage, aggregated physical RAM memory usage (MB), and a detailed breakdown of each individual instance with PID, process name, individual CPU %, and memory (MB). Use to verify if an application is active, hanging, or consuming excess resources.",
            inputSchema: z.object({
                name: z.string().describe("Process name or case-insensitive keyword to search for (e.g. 'node', 'python', 'docker', 'chrome').")
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
        "get_services",
        {
            description: "Query background system services, daemon processes, and Windows services. Returns total service counts, count of currently running services, count of stopped services, and a detailed list with internal service name, friendly display name, execution status ('Running' vs 'Stopped'), startup configuration mode ('Auto', 'Manual', 'Disabled'), and associated PID when running. Supports filtering by execution status and keyword search across service names and descriptions. Use to inspect service health, identify stopped essential services, or audit background daemons.",
            inputSchema: z.object({
                status: z.enum(["all", "running", "stopped"]).optional().default("all").describe("Filter services by execution state: 'all' for all services, 'running' for active services only, or 'stopped' for inactive services."),
                search: z.string().optional().describe("Case-insensitive text filter to search services by internal name or display name (e.g. 'update', 'docker', 'sql', 'audio', 'defender')."),
                limit: z.number().min(1).max(100).optional().default(30).describe("Maximum number of service entries to return (1 to 100, default: 30).")
            })
        },
        async ({ status, search, limit }) => {
            try {
                let serviceList: Array<{
                    name: string;
                    displayName: string;
                    status: "Running" | "Stopped";
                    startMode: string;
                    pid: number | null;
                }> = [];

                if (process.platform === "win32") {
                    try {
                        const { stdout } = await execAsync(
                            `powershell -NoProfile -Command "Get-CimInstance Win32_Service | Select-Object Name, DisplayName, State, StartMode, ProcessId | ConvertTo-Json -Compress"`
                        );
                        if (stdout.trim()) {
                            const items = JSON.parse(stdout.trim());
                            const arrayItems = Array.isArray(items) ? items : [items];
                            for (const item of arrayItems) {
                                if (!item || !item.Name) continue;
                                serviceList.push({
                                    name: item.Name,
                                    displayName: item.DisplayName || item.Name,
                                    status: item.State === "Running" ? "Running" : "Stopped",
                                    startMode: item.StartMode || "Unknown",
                                    pid: item.ProcessId && item.ProcessId > 0 ? item.ProcessId : null
                                });
                            }
                        }
                    } catch {
                        // fallback to si.services
                    }
                }

                if (serviceList.length === 0) {
                    const siServices = await si.services("*");
                    for (const s of siServices) {
                        serviceList.push({
                            name: s.name,
                            displayName: s.name,
                            status: s.running ? "Running" : "Stopped",
                            startMode: s.startmode || "Unknown",
                            pid: s.pids && s.pids.length > 0 && Number(s.pids[0]) > 0 ? Number(s.pids[0]) : null
                        });
                    }
                }

                // Apply status filter
                let filtered = serviceList;
                if (status === "running") {
                    filtered = filtered.filter((s) => s.status === "Running");
                } else if (status === "stopped") {
                    filtered = filtered.filter((s) => s.status === "Stopped");
                }

                // Apply search filter
                if (search && search.trim()) {
                    const query = search.toLowerCase().trim();
                    filtered = filtered.filter(
                        (s) => s.name.toLowerCase().includes(query) || s.displayName.toLowerCase().includes(query)
                    );
                }

                const totalMatching = filtered.length;
                const runningCount = serviceList.filter((s) => s.status === "Running").length;
                const stoppedCount = serviceList.filter((s) => s.status === "Stopped").length;

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    totalServicesSystem: serviceList.length,
                                    totalRunning: runningCount,
                                    totalStopped: stoppedCount,
                                    filterApplied: { status, search: search || null },
                                    returnedCount: Math.min(filtered.length, limit),
                                    totalMatching,
                                    services: filtered.slice(0, limit)
                                },
                                null,
                                2
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
                            text: `Error retrieving services: ${err.message}`
                        }
                    ]
                };
            }
        }
    );
}
