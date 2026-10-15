import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type McpServer } from "@modelcontextprotocol/server";
import si from "systeminformation";
import { readFileSync } from "node:fs";
let helpers: typeof import("../../src/tools/helpers.js");

let client: Client;
let server: McpServer;
async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    return { ...result, data: result.structuredContent as Record<string, any> };
}

beforeEach(async () => {
    vi.resetModules();
    helpers = await import("../../src/tools/helpers.js");
    const { createServer } = await import("../../src/server.js");
    server = createServer();
    client = new Client({ name: "regression-tests", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
});
afterEach(async () => {
    await client?.close();
    await server?.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("MCP contracts", () => {
    it("advertises the package version and read-only output schemas", async () => {
        const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
        expect(client.getServerVersion()?.version).toBe(pkg.version);
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(18);
        for (const tool of tools) {
            expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
            expect(tool.outputSchema?.type).toBe("object");
        }
    });
    it("rejects fractional limits before invoking collectors", async () => {
        const collect = vi.spyOn(si, "processes");
        const result = await call("get_top_processes", { limit: 1.5 });
        expect(result.isError).toBe(true);
        expect(collect).not.toHaveBeenCalled();
    });
    it("keeps structured output equal to text JSON", async () => {
        const result = await call("get_memory_status");
        expect(result.isError).not.toBe(true);
        const text = result.content.find(item => item.type === "text");
        expect(text?.type === "text" && JSON.parse(text.text)).toEqual(result.data);
    });
});

describe("network regression", () => {
    it("requests all interfaces, preserves wlo1 and converts bytes to Mbps", async () => {
        vi.useFakeTimers();
        const stats = vi.spyOn(si, "networkStats").mockResolvedValue([
            { iface: "wlo1", rx_sec: 1_000_000, tx_sec: 500_000, rx_bytes: 10_000_000, tx_bytes: 5_000_000 },
            { iface: "lo", rx_sec: 1_000_000, tx_sec: 0, rx_bytes: 1, tx_bytes: 0 },
            { iface: "Ethernet", rx_sec: 1, tx_sec: 0, rx_bytes: 1, tx_bytes: 0 }
        ] as Awaited<ReturnType<typeof si.networkStats>>);
        vi.spyOn(si, "networkInterfaces").mockResolvedValue([
            { iface: "lo", internal: true }, { iface: "wlo1", internal: false }, { iface: "Ethernet", internal: false }
        ] as Awaited<ReturnType<typeof si.networkInterfaces>>);
        const pending = call("get_network_speed");
        await vi.advanceTimersByTimeAsync(1001);
        const result = await pending;
        expect(result.isError).not.toBe(true);
        expect(stats).toHaveBeenNthCalledWith(1, "*");
        expect(stats).toHaveBeenNthCalledWith(2, "*");
        expect(result.data.interfaces).toHaveLength(2);
        expect(result.data.interfaces[0]).toMatchObject({ interface: "wlo1", downloadMbps: 8, uploadMbps: 4 });
        expect(result.data.busiestInterface).toBe("wlo1");
    });
    it("does not turn null rates into an idle measured interface", async () => {
        vi.useFakeTimers();
        vi.spyOn(si, "networkStats").mockResolvedValue([{ iface: "Ethernet", rx_sec: null, tx_sec: null }] as unknown as Awaited<ReturnType<typeof si.networkStats>>);
        vi.spyOn(si, "networkInterfaces").mockResolvedValue([]);
        const pending = call("get_network_speed");
        await vi.advanceTimersByTimeAsync(1001);
        expect((await pending).data).toMatchObject({ interfaces: [], measurementStatus: "unavailable" });
    });
});

describe("service enumeration support", () => {
    it.each([{}, { status: "running", search: "node", limit: 3 }])("reports macOS enumeration as unsupported for %j", async args => {
        vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
        const collect = vi.spyOn(si, "services");
        const powershell = vi.spyOn(helpers, "runPowerShell");
        const result = await call("get_services", args);
        expect(result.isError).toBe(true);
        expect(result.data).toMatchObject({ code: "UNSUPPORTED_PLATFORM", measurementStatus: "unsupported" });
        expect(result.data.message).toContain("search_process");
        expect(collect).not.toHaveBeenCalled();
        expect(powershell).not.toHaveBeenCalled();
    });

    it("still enumerates and filters Linux services", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("linux");
        const collect = vi.spyOn(si, "services").mockResolvedValue([
            { name: "node-service", running: true, startmode: "", pids: [123] },
            { name: "other-service", running: false, startmode: "", pids: [] }
        ] as Awaited<ReturnType<typeof si.services>>);
        const result = await call("get_services", { status: "running", search: "node", limit: 1 });
        expect(result.isError).not.toBe(true);
        expect(collect).toHaveBeenCalledWith("*");
        expect(result.data).toMatchObject({ totalServicesSystem: 2, totalRunning: 1, totalStopped: 1, totalMatching: 1, returnedCount: 1 });
        expect(result.data.services).toEqual([{ name: "node-service", displayName: "node-service", status: "Running", startMode: "Unknown", pid: 123 }]);
    });
});

describe("software inventory", () => {
    it("distinguishes unsupported platforms from an empty inventory", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("linux");
        const query = vi.spyOn(helpers, "runPowerShell");
        const result = await call("get_installed_programs");
        expect(result.isError).toBe(true);
        expect(result.data).toMatchObject({ code: "UNSUPPORTED_PLATFORM", measurementStatus: "unsupported" });
        expect(query).not.toHaveBeenCalled();
    });
    it("reports permission errors instead of claiming zero installed apps", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("win32");
        vi.spyOn(helpers, "runPowerShell").mockRejectedValue(new Error("Access denied"));
        const result = await call("get_installed_programs");
        expect(result.isError).toBe(true);
        expect(result.data).toMatchObject({ code: "COLLECTION_FAILED", message: "Access denied" });
    });
    it("sorts sizes with unknown values last", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("win32");
        vi.spyOn(helpers, "runPowerShell").mockResolvedValue({ stdout: JSON.stringify([
            { DisplayName: "Unknown", EstimatedSize: null },
            { DisplayName: "Small", EstimatedSize: 1024 },
            { DisplayName: "Big", EstimatedSize: 10240 }
        ]), stderr: "" });
        const result = await call("get_installed_programs", { sortBy: "size" });
        expect(result.isError).not.toBe(true);
        expect(result.data.programs.map((p: { name: string }) => p.name)).toEqual(["Big", "Small", "Unknown"]);
    });
    it("accepts a singleton JSON inventory", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("win32");
        vi.spyOn(helpers, "runPowerShell").mockResolvedValue({ stdout: JSON.stringify({ DisplayName: "Single App", EstimatedSize: 1024 }), stderr: "" });
        expect((await call("get_installed_programs")).data).toMatchObject({ totalInstalledPrograms: 1, programs: [{ name: "Single App", sizeMB: 1 }] });
    });
});

describe("GPU telemetry through MCP", () => {
    it("filters process memory by the selected GPU UUID", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("linux");
        vi.spyOn(helpers, "execFileAsync").mockImplementation(async (_file, args) => ({ stdout: args[0].startsWith("--query-gpu=")
            ? "0, GPU-a, First GPU, 8192, 1024, 7168\n1, GPU-b, Second GPU, 4096, 2048, 2048"
            : "GPU-a, 123, first.exe, 1000\nGPU-b, 456, second.exe, 2000", stderr: "" }));
        const result = await call("get_gpu_processes", { gpuId: "1" });
        expect(result.isError).not.toBe(true);
        expect(result.data).toMatchObject({ gpuId: "GPU-b", totalVramMB: 4096, usedVramMB: 2048, activeGpuProcessCount: 1 });
        expect(result.data.processes[0]).toMatchObject({ gpuId: "GPU-b", pid: 456 });
    });
    it("reports unknown usage/free VRAM as null without NVIDIA telemetry", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("linux");
        vi.spyOn(helpers, "execFileAsync").mockRejectedValue(new Error("not installed"));
        vi.spyOn(si, "graphics").mockResolvedValue({ controllers: [{ model: "AMD", vram: 4096 }], displays: [] } as unknown as Awaited<ReturnType<typeof si.graphics>>);
        const result = await call("get_gpu_processes");
        expect(result.isError).not.toBe(true);
        expect(result.data).toMatchObject({ totalVramMB: 4096, usedVramMB: null, freeVramMB: null, remainingMarginGB: null, processStatus: "unavailable" });
    });
});

describe("shared resource and tool collectors", () => {
    it("returns the same incomplete sample through resource and tool", async () => {
        vi.spyOn(si, "currentLoad").mockRejectedValue(new Error("CPU sensor unavailable"));
        const tool = await call("get_system_health");
        const resource = await client.readResource({ uri: "system://health" });
        const content = resource.contents[0];
        expect("text" in content && JSON.parse(content.text)).toEqual(tool.data);
        expect(tool.data.cpuLoadPercentage).toBeNull();
        expect(tool.data.measurementStatus).toBe("partial");
    });
    it("compares multiple real samples rather than repeating a cached sample", async () => {
        vi.useFakeTimers();
        const load = vi.spyOn(si, "currentLoad").mockResolvedValueOnce({ currentLoad: 10 } as Awaited<ReturnType<typeof si.currentLoad>>)
            .mockResolvedValueOnce({ currentLoad: 95 } as Awaited<ReturnType<typeof si.currentLoad>>);
        vi.spyOn(si, "fsSize").mockResolvedValue([]);
        vi.spyOn(si, "disksIO").mockResolvedValue({ rIO_sec: -1, wIO_sec: -1 } as Awaited<ReturnType<typeof si.disksIO>>);
        const pending = call("get_performance_diagnostics", { samples: 2, intervalMs: 250 });
        await vi.advanceTimersByTimeAsync(251);
        const result = await pending;
        expect(result.isError).not.toBe(true);
        expect(load).toHaveBeenCalledTimes(2);
        expect(result.data.summary.cpu).toMatchObject({ average: 52.5, peak: 95, sustainedPressure: false });
        expect(result.data.samples[0].diskIO.readOperationsPerSecond).toBeNull();
    });
});
