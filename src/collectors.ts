import os from "node:os";
import si from "systeminformation";

export function cachedCollector<T>(collect: () => Promise<T>, ttlMs: number) {
    let pending: Promise<T> | undefined;
    let expiresAt = 0;
    return () => {
        if (!pending || Date.now() >= expiresAt) {
            expiresAt = Number.POSITIVE_INFINITY;
            pending = collect().then(value => {
                expiresAt = Date.now() + ttlMs;
                return value;
            }, error => {
                pending = undefined;
                expiresAt = 0;
                throw error;
            });
        }
        return pending;
    };
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([promise, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Collection timed out after ${ms} ms`)), ms);
        })]);
    } finally {
        clearTimeout(timer);
    }
}

export async function collectSystemSnapshot() {
    let cpuLoad: number | null = null;
    const errors: string[] = [];
    try {
        const data = await withTimeout(si.currentLoad(), 5000);
        if (Number.isFinite(data.currentLoad) && data.currentLoad >= 0) {
            cpuLoad = Number(data.currentLoad.toFixed(2));
        } else errors.push("CPU measurement unavailable");
    } catch (error) {
        errors.push(`CPU measurement unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const ramLoad = totalRam > 0 ? Number(((totalRam - freeRam) / totalRam * 100).toFixed(2)) : null;
    if (ramLoad === null) errors.push("RAM measurement unavailable");
    const status = cpuLoad !== null && cpuLoad >= 90 || ramLoad !== null && ramLoad >= 90 ? "CRITICAL"
        : cpuLoad !== null && cpuLoad >= 75 || ramLoad !== null && ramLoad >= 75 ? "WARNING"
        : errors.length ? "UNKNOWN" : "HEALTHY";
    const alerts = [...errors];
    if (cpuLoad !== null && cpuLoad >= 75) alerts.push(`${cpuLoad >= 90 ? "CRITICAL" : "WARNING"}: CPU utilization is elevated (${cpuLoad}%).`);
    if (ramLoad !== null && ramLoad >= 75) alerts.push(`${ramLoad >= 90 ? "CRITICAL" : "WARNING"}: RAM utilization is elevated (${ramLoad}%).`);
    if (!alerts.length) alerts.push("System is operating normally within optimal parameters.");
    return {
        status, cpuLoadPercentage: cpuLoad === null ? null : `${cpuLoad}%`,
        ramLoadPercentage: ramLoad === null ? null : `${ramLoad}%`,
        totalRamGB: Number((totalRam / 1024 ** 3).toFixed(2)),
        freeRamGB: Number((freeRam / 1024 ** 3).toFixed(2)),
        uptimeSeconds: Math.floor(os.uptime()), alerts,
        sampledAt: new Date().toISOString(),
        measurementStatus: errors.length ? "partial" : "available",
        source: { cpu: "systeminformation.currentLoad", memory: "node:os" }
    };
}

export const getSystemSnapshot = cachedCollector(collectSystemSnapshot, 250);
export const getHardwareSnapshot = cachedCollector(async () => {
    const [baseboard, bios, memLayout, diskLayout, systemData, graphicsData] = await withTimeout(Promise.all([
        si.baseboard(), si.bios(), si.memLayout(), si.diskLayout(), si.system(), si.graphics()
    ]), 20000);
    return { baseboard, bios, memLayout, diskLayout, systemData, graphicsData, sampledAt: new Date().toISOString() };
}, 30000);

export function formatUptime(seconds: number) {
    return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
}
