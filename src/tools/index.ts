import type { McpServer } from "@modelcontextprotocol/server";
import { registerSystemTools } from "./system.js";
import { registerPerformanceTools } from "./performance.js";
import { registerNetworkTools } from "./network.js";
import { registerProcessTools } from "./processes.js";
import { registerHardwareTools } from "./hardware.js";

export function registerAllTools(server: McpServer) {
    registerSystemTools(server);
    registerPerformanceTools(server);
    registerNetworkTools(server);
    registerProcessTools(server);
    registerHardwareTools(server);
}
