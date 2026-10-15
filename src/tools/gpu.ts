import si from "systeminformation";
import { execFileAsync, runPowerShell } from "./helpers.js";

export function finiteMemory(value: unknown): number | null {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

export function parseGpuSummary(csv: string) {
    return csv.trim().split(/\r?\n/).filter(Boolean).map(line => {
        const [index, id, name, total, used, free] = line.split(",").map(value => value.trim());
        if (!id || !name) throw new Error("Invalid nvidia-smi GPU summary");
        return { index, id, name, totalMB: finiteMemory(total), usedMB: finiteMemory(used), freeMB: finiteMemory(free) };
    });
}

type GpuProcess = { gpuId: string; pid: number; name: string; vramUsedMB: number | null; sharedVramMB: number | null };

export function parseGpuProcesses(csv: string): GpuProcess[] {
    return csv.trim().split(/\r?\n/).filter(Boolean).flatMap(line => {
        const values = line.split(",").map(value => value.trim());
        const [gpuId, rawPid] = values;
        const pid = Number(rawPid);
        if (values.length < 4 || !gpuId || !Number.isInteger(pid) || pid <= 0) return [];
        return [{ gpuId, pid, name: values.slice(2, -1).join(","), vramUsedMB: finiteMemory(values.at(-1)), sharedVramMB: null }];
    });
}

export async function collectGpuProcesses(gpuId: string | undefined, limit: number) {
    const errors: string[] = [];
    let gpus: ReturnType<typeof parseGpuSummary> = [];
    let processes: GpuProcess[] = [];
    let processStatus = "unavailable";
    let processSource: string | null = null;
    let source = "nvidia-smi";
    try {
        const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=index,uuid,name,memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"]);
        gpus = parseGpuSummary(stdout);
    } catch {
        source = "systeminformation.graphics";
        const graphics = await si.graphics();
        gpus = graphics.controllers.map((gpu, index) => {
            const totalMB = finiteMemory(gpu.vram);
            const usedMB = finiteMemory(gpu.memoryUsed);
            return { index: String(index), id: `adapter-${index}`, name: gpu.model || "Unknown GPU", totalMB, usedMB,
                freeMB: totalMB !== null && usedMB !== null && usedMB <= totalMB ? totalMB - usedMB : null };
        });
    }
    const selected = gpuId === undefined ? gpus[0] : gpus.find(gpu => gpu.id === gpuId || gpu.index === gpuId);
    if (gpuId !== undefined && !selected) throw new Error(`GPU '${gpuId}' not found. Use an id or index from gpus.`);
    if (source === "nvidia-smi") {
        try {
            const { stdout } = await execFileAsync("nvidia-smi", ["--query-compute-apps=gpu_uuid,pid,process_name,used_gpu_memory", "--format=csv,noheader,nounits"]);
            processes = parseGpuProcesses(stdout);
            processStatus = "available";
            processSource = "nvidia-smi compute applications (graphics-only processes excluded)";
        } catch (error) { errors.push(`Compute process telemetry unavailable: ${error instanceof Error ? error.message : String(error)}`); }
    }
    // Windows counters lack an NVIDIA UUID. Use them only when there is exactly
    // one physical adapter, so memory from different GPUs cannot be mixed.
    if (process.platform === "win32" && gpus.length === 1) {
        try {
            const graphics = await si.graphics();
            if (graphics.controllers.length === 1) {
                const { stdout } = await runPowerShell("Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | Select-Object Name, DedicatedUsage, SharedUsage | ConvertTo-Json -Compress");
                const raw: unknown = stdout.trim() ? JSON.parse(stdout) : [];
                const rows = Array.isArray(raw) ? raw : [raw];
                const byPid = new Map<number, GpuProcess>();
                for (const row of rows) {
                    const pid = Number(row?.Name?.match(/pid_(\d+)_/i)?.[1]);
                    const bytes = finiteMemory(row?.DedicatedUsage);
                    if (!Number.isInteger(pid) || pid <= 0 || bytes === null || bytes <= 0) continue;
                    const shared = finiteMemory(row.SharedUsage);
                    const previous = byPid.get(pid);
                    if (!previous || (previous.vramUsedMB ?? 0) < bytes / 1024 ** 2) {
                        byPid.set(pid, { gpuId: gpus[0].id, pid, name: `Process [PID ${pid}]`, vramUsedMB: bytes / 1024 ** 2,
                            sharedVramMB: shared === null ? null : shared / 1024 ** 2 });
                    }
                }
                processes = [...byPid.values()];
                processStatus = "available";
                processSource = "Windows GPUProcessMemory (single physical adapter)";
                try {
                    const names = new Map((await si.processes()).list.map(p => [p.pid, p.name]));
                    processes.forEach(p => p.name = names.get(p.pid) ?? p.name);
                } catch { /* PID remains a valid process identifier. */ }
            }
        } catch (error) { errors.push(`Windows process telemetry unavailable: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const selectedProcesses = processes.filter(p => p.gpuId === selected?.id)
        .sort((a, b) => (b.vramUsedMB ?? -1) - (a.vramUsedMB ?? -1));
    const totalVramMB = selected?.totalMB ?? null;
    const usedVramMB = selected?.usedMB ?? null;
    const freeVramMB = selected?.freeMB ?? null;
    const gb = (mb: number | null) => mb === null ? null : Number((mb / 1024).toFixed(2));
    return {
        gpuId: selected?.id ?? null, gpuModel: selected?.name ?? "Unknown GPU", gpus,
        totalVramMB, totalVramGB: gb(totalVramMB), usedVramMB, usedVramGB: gb(usedVramMB), freeVramMB,
        remainingMarginGB: gb(freeVramMB),
        vramUsagePercentage: totalVramMB !== null && totalVramMB > 0 && usedVramMB !== null ? `${Number((usedVramMB / totalVramMB * 100).toFixed(2))}%` : null,
        activeGpuProcessCount: processStatus === "available" ? selectedProcesses.length : null,
        processes: selectedProcesses.slice(0, limit).map(p => ({ ...p, vramUsedGB: gb(p.vramUsedMB) })),
        sampledAt: new Date().toISOString(), source, processSource, processStatus, errors,
        measurementStatus: totalVramMB !== null && usedVramMB !== null && freeVramMB !== null ? "available" : "partial"
    };
}
