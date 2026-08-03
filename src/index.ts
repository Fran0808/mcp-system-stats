#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAllTools } from "./tools/index.js";
import { registerAllPrompts } from "./prompts/index.js";

export const server = new McpServer({
    name: "system-stats",
    version: "1.0.0"
});

registerAllTools(server);
registerAllPrompts(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server MCP running successfully");
}

if (process.env.NODE_ENV !== "test") {
    main().catch((error) => {
        console.error("Fatal error in main():", error);
        process.exit(1);
    });
}