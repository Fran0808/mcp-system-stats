import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod"
import os, { platform } from "node:os";
import { error } from "node:console";

const server = new McpServer({
    name: "system-stats",
    version: "1.0.0"
})


server.registerTool(
    "get_system_overview",
    {
        description: "Retrieves a general summary of the system: OS name, version, architecture, CPU model, number of cores, hostname, and uptime."
    },
    async () => {
        const cpus = os.cpus();
        const overview = {
            platform: os.platform,
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
/*
server.registerTool(
    "get_memory_status",
    {
        description:
    }
)
server.registerTool(
    "get_disk_space",
    {
        description:
    }
)
*/

async function main(){
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server MCP running successfully")

    main().catch((error) => {
        console.error("Fatal error in main():", error);
        process.exit(1);
    });
}