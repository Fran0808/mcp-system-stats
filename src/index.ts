import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod"
import os, { platform } from "node:os";
import fs from "node:fs";
import { error } from "node:console";
import si from "systeminformation";

const server = new McpServer({
    name: "system-stats",
    version: "1.0.0"
})


server.registerTool(
    "get_system_overview",
    {
        description: "Use this tool whenever the user asks about their local operating system, local OS name/version, CPU specifications, hardware info, hostname, or system uptime."
    },
    async () => {
        const cpus = os.cpus();
        const overview = {
            platform: os.platform(),
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            cpuModel: cpus.length > 0 ? cpus[0].model : "Unknown",
            cpuCores: cpus.length,
            hostname: os.hostname(),
            username: os.userInfo().username,
            uptimeSeconds: Math.floor(os.uptime())
        };
        return{
            content: [
                {
                    type: "text",
                    text: JSON.stringify(overview, null, 2)
                }
            ]
        };
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
            const stats = fs.statfsSync(path);
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

            // Take the top N processes and format output
            const topProcesses = sortedList.slice(0, limit).map((p) => ({
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
            const networkDetails: Record<string, any[]> = {};

            for (const name of Object.keys(nets)) {
                const netList = nets[name];
                if (netList) {
                    networkDetails[name] = netList.map((net) => ({
                        address: net.address,
                        family: net.family,
                        mac: net.mac,
                        internal: net.internal
                    }));
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(networkDetails, null, 2)
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
async function main(){
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server MCP running successfully")

}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});