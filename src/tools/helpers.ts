import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFilePromise = promisify(execFile);

export async function execFileAsync(file: string, args: string[], options: { timeout?: number } = {}) {
    return execFilePromise(file, args, { timeout: 10000, maxBuffer: 4 * 1024 * 1024,
        windowsHide: true, encoding: "utf8", ...options });
}

export async function runPowerShell(script: string) {
    return execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-NoLogo", "-Command",
        "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " + script]);
}

export async function getWindowsCpuTemp(): Promise<{ mainC: number | null; perCore: Array<{ core: number; tempC: string }>; source: string }> {
    if (os.platform() !== "win32") return { mainC: null, perCore: [], source: "N/A" };

    try {
        const psScript = `
            try {
                $lhm = Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction Stop | Where-Object SensorType -eq 'Temperature' | Select-Object Name, Value;
                if ($lhm) { ConvertTo-Json -InputObject @{ type='LHM'; data=$lhm }; exit }
            } catch {}
        `;

        const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-NoLogo", "-Command", psScript], { timeout: 3000 });

        if (stdout && stdout.trim()) {
            const result = JSON.parse(stdout.trim());
            if (result.type === "LHM" && result.data) {
                const list = Array.isArray(result.data) ? result.data : [result.data];
                const cpuCoreSensors = list.filter((s: any) => s.Name && s.Name.toLowerCase().includes("cpu core"));
                if (cpuCoreSensors.length > 0) {
                    const perCore = cpuCoreSensors.map((s: any, idx: number) => ({
                        core: idx,
                        tempC: `${Math.round(s.Value)}°C`
                    }));
                    const avgTemp = Number((cpuCoreSensors.reduce((acc: number, s: any) => acc + s.Value, 0) / cpuCoreSensors.length).toFixed(1));
                    return { mainC: avgTemp, perCore, source: "LibreHardwareMonitor WMI" };
                }
            }
        }
    } catch {
        // Fallback gracefully
    }

    return { mainC: null, perCore: [], source: "N/A" };
}
