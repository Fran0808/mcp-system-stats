#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

async function main() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Server MCP running successfully");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
