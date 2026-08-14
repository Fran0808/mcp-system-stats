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
            description: "Use this tool whenever the user asks about top processes, heavy applications, or which programs are consuming the most CPU or RAM memory on their local computer.",
            inputSchema: z.object({
                sortBy: z.enum(["cpu", "memory"]).optional().default("cpu"),
                limit: z.number().min(1).max(50).optional().default(5),
                groupByApp: z.boolean().optional().default(true)
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
        "get_services",
        {
            description: "Use this tool whenever the user asks about background system services, Windows services, their status (Running/Stopped), start mode (Automatic/Manual/Disabled), or wants to search for a specific service like update, docker, sql, audio, defender, etc.",
            inputSchema: z.object({
                status: z.enum(["all", "running", "stopped"]).optional().default("all"),
                search: z.string().optional(),
                limit: z.number().min(1).max(100).optional().default(30)
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
