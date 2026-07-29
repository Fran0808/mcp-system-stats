import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod"

const server = new McpServer({
    name: "system-stats",
    version: "1.0.0"
})


