import { McpServer } from "@modelcontextprotocol/server";
import { registerAllTools } from "./tools/index.js";
import { registerAllPrompts } from "./prompts/index.js";
import { registerAllResources } from "./resources/index.js";
import { packageVersion } from "./version.js";

export function createServer() {
    const server = new McpServer({ name: "system-stats", version: packageVersion });
    registerAllTools(server);
    registerAllPrompts(server);
    registerAllResources(server);
    return server;
}
