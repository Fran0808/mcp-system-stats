import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const percentage = z.string().regex(/^\d+(\.\d+)?%$/);
const records = z.array(z.record(z.string(), z.unknown()));
const count = z.number().int().nonnegative();
const health = {
    status: z.enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"]),
    cpuLoadPercentage: percentage.nullable(), ramLoadPercentage: percentage.nullable(),
    alerts: z.array(z.string()), sampledAt: z.string(), measurementStatus: z.enum(["available", "partial"])
};
const outputSchemas = {
    get_system_overview: z.looseObject({ platform: z.string(), cpuLoadPercentage: percentage.nullable(), sampledAt: z.string() }),
    get_system_health: z.looseObject(health),
    get_battery_status: z.looseObject({ hasBattery: z.boolean() }),
    get_cpu_stats: z.looseObject({ model: z.string(), load: z.object({ totalPercentage: percentage }).passthrough(), temperature: z.record(z.string(), z.unknown()) }),
    get_memory_status: z.looseObject({ unit: z.enum(["MB", "GB"]), total: z.number(), used: z.number(), free: z.number(), usedPercentage: percentage }),
    get_disk_space: z.looseObject({ path: z.string(), totalGB: z.number(), usedGB: z.number(), freeGB: z.number(), usedPercentage: percentage }),
    get_top_processes: z.looseObject({ count, groupedByApp: z.boolean(), processes: records }),
    search_process: z.looseObject({ query: z.string(), isRunning: z.boolean() }),
    get_services: z.looseObject({ totalServicesSystem: count, services: records }),
    get_network_info: z.looseObject({ external: z.record(z.string(), records), loopback: z.record(z.string(), records) }),
    get_network_speed: z.looseObject({ samplingIntervalMs: z.number(), busiestInterface: z.string(), interfaces: records }),
    get_gpu_stats: z.looseObject({ gpuCount: count, gpus: records, displayCount: count, displays: records }),
    get_gpu_processes: z.looseObject({ gpuModel: z.string(), totalVramMB: z.number().nullable(), usedVramMB: z.number().nullable(), freeVramMB: z.number().nullable(), processes: records }),
    get_hardware_specs: z.looseObject({ motherboard: z.record(z.string(), z.unknown()), ramLayout: z.record(z.string(), z.unknown()), physicalDrives: z.record(z.string(), z.unknown()) }),
    get_usb_devices: z.looseObject({ totalConnected: count, categorySummary: z.record(z.string(), count) }),
    get_startup_programs: z.looseObject({ totalStartupPrograms: count, programs: records }),
    get_installed_programs: z.looseObject({ totalInstalledPrograms: count, programs: records }),
    get_performance_diagnostics: z.looseObject({ samples: records, summary: z.record(z.string(), z.unknown()), sampledAt: z.string() })
};

export function toolError(code: string, message: string): CallToolResult {
    const data = { code, message, measurementStatus: code === "UNSUPPORTED_PLATFORM" ? "unsupported" : "unavailable" };
    return { isError: true, structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function registerTool<Input extends z.ZodObject = z.ZodObject<{}>>(
    server: McpServer,
    name: keyof typeof outputSchemas,
    config: { description: string; inputSchema?: Input },
    handler: (args: z.output<Input>) => Promise<CallToolResult>
) {
    return server.registerTool(name, {
        ...config,
        inputSchema: config.inputSchema ?? z.object({}),
        outputSchema: outputSchemas[name],
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async args => {
        try {
            const result = await handler(args as z.output<Input>);
            if (result.isError) {
                if (result.structuredContent) return result;
                const errorText = result.content.find(item => item.type === "text");
                return toolError("COLLECTION_FAILED", errorText?.type === "text" ? errorText.text : "Collection failed");
            }
            const text = result.content.find(item => item.type === "text");
            if (!text || text.type !== "text") throw new Error("Expected JSON tool result");
            const data = outputSchemas[name].parse(JSON.parse(text.text));
            return { ...result, structuredContent: data, content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
            return toolError("COLLECTION_FAILED", error instanceof Error ? error.message : String(error));
        }
    });
}
