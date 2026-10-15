import type { McpServer } from "@modelcontextprotocol/server";
import si from "systeminformation";
import { z } from "zod";
import { collectSystemSnapshot, withTimeout } from "../collectors.js";
import { registerTool } from "./register.js";

export function summarize(values: Array<number | null>, pressureThreshold: number | null = 75) {
    const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
    return {
        availableSamples: available.length,
        average: available.length ? Number((available.reduce((a, b) => a + b, 0) / available.length).toFixed(2)) : null,
        peak: available.length ? Math.max(...available) : null,
        sustainedPressure: pressureThreshold === null ? null : available.length > 0 && available.length === values.length && available.every(value => value >= pressureThreshold)
    };
}

export function registerDiagnosticTools(server: McpServer) {
    registerTool(server, "get_performance_diagnostics", {
        description: "Compare CPU, RAM and disk I/O across multiple timestamped samples to distinguish sustained pressure from an isolated spike. Includes mounted-volume capacity. Missing telemetry is explicitly marked; disk I/O rates alone do not establish a bottleneck.",
        inputSchema: z.object({
            samples: z.number().int().min(2).max(5).default(3),
            intervalMs: z.number().int().min(250).max(2000).default(1000)
        })
    }, async ({ samples: count, intervalMs }) => {
        const startedAt = Date.now();
        const volumes = await withTimeout(si.fsSize(), 5000).then(disks => ({
            status: "available", volumes: disks.map(d => ({ mount: d.mount, sizeBytes: d.size, availableBytes: d.available, usedPercentage: d.use }))
        }), error => ({ status: "unavailable", volumes: [], error: String(error) }));
        const samples = [];
        for (let index = 0; index < count; index++) {
            if (index) await new Promise(resolve => setTimeout(resolve, intervalMs));
            const [system, io] = await Promise.all([
                collectSystemSnapshot(),
                withTimeout(si.disksIO(), 5000).then(value => ({ value, error: null as string | null }),
                    error => ({ value: null, error: String(error) }))
            ]);
            const rate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
            samples.push({ ...system,
                cpuPercentage: system.cpuLoadPercentage === null ? null : parseFloat(system.cpuLoadPercentage),
                ramPercentage: system.ramLoadPercentage === null ? null : parseFloat(system.ramLoadPercentage),
                diskIO: { readOperationsPerSecond: rate(io.value?.rIO_sec), writeOperationsPerSecond: rate(io.value?.wIO_sec),
                    source: "systeminformation.disksIO", error: io.error }
            });
        }
        const cpu = summarize(samples.map(s => s.cpuPercentage));
        const memory = summarize(samples.map(s => s.ramPercentage));
        const findings: string[] = [];
        if (cpu.sustainedPressure) findings.push("CPU pressure persisted throughout the sampling window.");
        if (memory.sustainedPressure) findings.push("RAM pressure persisted throughout the sampling window.");
        if (cpu.availableSamples < count || memory.availableSamples < count) findings.push("Some system samples are unavailable; the diagnostic is incomplete.");
        if (samples.some(s => s.diskIO.readOperationsPerSecond === null || s.diskIO.writeOperationsPerSecond === null)) findings.push("Disk I/O telemetry is incomplete or unsupported on this system.");
        if (volumes.volumes.some(d => d.usedPercentage >= 85)) findings.push("At least one mounted volume is at least 85% full.");
        if (volumes.status !== "available") findings.push("Volume capacity is unavailable; low-disk-space checks are incomplete.");
        if (!findings.length) findings.push("No sustained CPU/RAM pressure or low-capacity warning detected in this window. I/O rates alone do not establish a bottleneck.");
        return { content: [{ type: "text", text: JSON.stringify({
            sampledAt: new Date().toISOString(), source: "systeminformation / node:os", intervalMs,
            elapsedMs: Date.now() - startedAt, samples, volumes,
            summary: { cpu, memory,
                diskReadOperationsPerSecond: summarize(samples.map(s => s.diskIO.readOperationsPerSecond), null),
                diskWriteOperationsPerSecond: summarize(samples.map(s => s.diskIO.writeOperationsPerSecond), null), findings }
        }, null, 2) }] };
    });
}
