import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod"
import os, { platform } from "node:os";
import fs from "node:fs";
import { error } from "node:console";

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

async function main(){
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server MCP running successfully")

}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});