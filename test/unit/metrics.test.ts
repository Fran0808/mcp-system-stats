import { afterEach, describe, expect, it, vi } from "vitest";
import si from "systeminformation";
import os from "node:os";
import { cachedCollector, collectSystemSnapshot, withTimeout } from "../../src/collectors.js";
import { finiteMemory, parseGpuProcesses, parseGpuSummary } from "../../src/tools/gpu.js";
import { summarize } from "../../src/tools/diagnostics.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("measurement quality", () => {
    it("does not report an unreadable CPU as healthy or zero", async () => {
        vi.spyOn(si, "currentLoad").mockRejectedValue(new Error("sensor denied"));
        vi.spyOn(os, "totalmem").mockReturnValue(16 * 1024 ** 3);
        vi.spyOn(os, "freemem").mockReturnValue(12 * 1024 ** 3);
        const report = await collectSystemSnapshot();
        expect(report.status).toBe("UNKNOWN");
        expect(report.cpuLoadPercentage).toBeNull();
        expect(report.measurementStatus).toBe("partial");
        expect(report.alerts.join(" ")).toContain("sensor denied");
    });
    it("preserves known critical RAM pressure when CPU is missing", async () => {
        vi.spyOn(si, "currentLoad").mockRejectedValue(new Error("unavailable"));
        vi.spyOn(os, "totalmem").mockReturnValue(1000);
        vi.spyOn(os, "freemem").mockReturnValue(50);
        expect((await collectSystemSnapshot()).status).toBe("CRITICAL");
    });
    it("rejects non-finite CPU measurements", async () => {
        vi.spyOn(si, "currentLoad").mockResolvedValue({ currentLoad: NaN } as Awaited<ReturnType<typeof si.currentLoad>>);
        expect((await collectSystemSnapshot()).cpuLoadPercentage).toBeNull();
    });
    it("coalesces concurrent collectors, expires results, and retries failures", async () => {
        vi.useFakeTimers();
        const collect = vi.fn().mockResolvedValue(1);
        const cached = cachedCollector(collect, 250);
        expect(await Promise.all([cached(), cached()])).toEqual([1, 1]);
        expect(collect).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(251);
        collect.mockRejectedValueOnce(new Error("offline"));
        await expect(cached()).rejects.toThrow("offline");
        expect(await cached()).toBe(1);
        expect(collect).toHaveBeenCalledTimes(3);
    });
    it("bounds a stuck collector", async () => {
        vi.useFakeTimers();
        const pending = expect(withTimeout(new Promise(() => {}), 50)).rejects.toThrow("timed out");
        await vi.advanceTimersByTimeAsync(50);
        await pending;
    });
});

describe("GPU identity and unavailable values", () => {
    it("parses multiple GPU rows without combining adapters", () => {
        const gpus = parseGpuSummary("0, GPU-a, First GPU, 8192, 1024, 7168\n1, GPU-b, Second GPU, 4096, [N/A], [N/A]\n");
        expect(gpus).toHaveLength(2);
        expect(gpus[0].freeMB).toBe(7168);
        expect(gpus[1].usedMB).toBeNull();
        expect(gpus[1].totalMB).toBe(4096);
    });
    it("keeps process GPU UUID and unknown memory", () => {
        const processes = parseGpuProcesses("GPU-a, 123, model.exe, 1024\nGPU-b, 123, model.exe, [N/A]\n");
        expect(processes[0].gpuId).toBe("GPU-a");
        expect(processes[1].gpuId).toBe("GPU-b");
        expect(processes[1].vramUsedMB).toBeNull();
    });
    it.each([undefined, null, "", "[N/A]", "invalid", "100 garbage", -1, Infinity, NaN])("does not turn %s into zero", value => {
        expect(finiteMemory(value)).toBeNull();
    });
    it("preserves a measured zero", () => { expect(finiteMemory("0")).toBe(0); });
});

describe("temporal diagnostics", () => {
    it("distinguishes an isolated spike from sustained load", () => {
        expect(summarize([10, 95, 10])).toMatchObject({ peak: 95, average: 38.33, sustainedPressure: false });
        expect(summarize([85, 95, 90])).toMatchObject({ sustainedPressure: true, availableSamples: 3 });
    });
    it("does not treat missing samples as zero or sustained pressure", () => {
        expect(summarize([90, null])).toMatchObject({ average: 90, availableSamples: 1, sustainedPressure: false });
        expect(summarize([null])).toMatchObject({ average: null, peak: null });
        expect(summarize([]).sustainedPressure).toBe(false);
        expect(summarize([1000, 2000], null).sustainedPressure).toBeNull();
    });
});
