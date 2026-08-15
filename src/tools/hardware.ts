import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import si from "systeminformation";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export function registerHardwareTools(server: McpServer) {
    server.registerTool(
        "get_gpu_processes",
        {
            description: "Analyze per-process graphics memory (VRAM) utilization and evaluate GPU memory headroom. Returns GPU model, total VRAM (MB/GB), used VRAM, free VRAM, remaining VRAM margin (GB), overall VRAM usage percentage, and a ranked list of active processes using the GPU with PID, application name, dedicated VRAM (MB/GB), and shared VRAM (MB). Use to identify memory-heavy AI models (e.g. Ollama, PyTorch, Stable Diffusion, LM Studio), 3D renderers, or games, and determine if sufficient VRAM remains to load new models without out-of-memory errors.",
            inputSchema: z.object({
                limit: z.number().min(1).max(50).optional().default(15).describe("Maximum number of top VRAM-consuming processes to return (1 to 50, default: 15).")
            })
        },
        async ({ limit }) => {
            try {
                let nvidiaGpuData: { name: string; totalMB: number; usedMB: number; freeMB: number } | null = null;
                try {
                    const { stdout: gpuSummary } = await execAsync(
                        "nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader,nounits"
                    );
                    const parts = gpuSummary.trim().split(",").map((s) => s.trim());
                    if (parts.length >= 4) {
                        nvidiaGpuData = {
                            name: parts[0],
                            totalMB: parseFloat(parts[1]),
                            usedMB: parseFloat(parts[2]),
                            freeMB: parseFloat(parts[3])
                        };
                    }
                } catch {
                    // nvidia-smi not available or no NVIDIA GPU
                }

                const processMap = new Map<number, { pid: number; vramUsedBytes: number; sharedVramBytes: number }>();

                if (process.platform === "win32") {
                    try {
                        const { stdout: psOutput } = await execAsync(
                            `powershell -NoProfile -Command "Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | Where-Object DedicatedUsage -gt 1048576 | Select-Object Name, DedicatedUsage, SharedUsage | ConvertTo-Json"`
                        );

                        if (psOutput.trim()) {
                            const items = JSON.parse(psOutput.trim());
                            const arrayItems = Array.isArray(items) ? items : [items];

                            for (const item of arrayItems) {
                                if (!item || !item.Name || typeof item.DedicatedUsage !== "number") continue;
                                const pidMatch = item.Name.match(/pid_(\d+)_/i);
                                if (!pidMatch) continue;

                                const pid = parseInt(pidMatch[1], 10);
                                if (isNaN(pid) || pid <= 0) continue;

                                const dedicatedBytes = item.DedicatedUsage;
                                const sharedBytes = typeof item.SharedUsage === "number" ? item.SharedUsage : 0;
                                const existing = processMap.get(pid);
                                if (existing) {
                                    existing.vramUsedBytes = Math.max(existing.vramUsedBytes, dedicatedBytes);
                                    existing.sharedVramBytes = Math.max(existing.sharedVramBytes, sharedBytes);
                                } else {
                                    processMap.set(pid, { pid, vramUsedBytes: dedicatedBytes, sharedVramBytes: sharedBytes });
                                }
                            }
                        }
                    } catch {
                        // ignore PowerShell error
                    }
                }
                
                if (processMap.size === 0) {
                    try {
                        const { stdout: computeApps } = await execAsync(
                            "nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits"
                        );
                        const lines = computeApps.trim().split("\n");
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            const cols = line.split(",").map((c) => c.trim());
                            if (cols.length >= 2) {
                                const pid = parseInt(cols[0], 10);
                                const vramUsedMB = cols[2] && cols[2] !== "[N/A]" ? parseFloat(cols[2]) : 0;
                                if (!isNaN(pid) && vramUsedMB > 0) {
                                    processMap.set(pid, { pid, vramUsedBytes: vramUsedMB * 1024 * 1024, sharedVramBytes: 0 });
                                }
                            }
                        }
                    } catch {
                        // ignore nvidia-smi compute-apps fallback
                    }
                }

                let procNameMap = new Map<number, string>();
                try {
                    const systemProcData = await si.processes();
                    procNameMap = new Map(systemProcData.list.map((p) => [p.pid, p.name]));
                } catch {
                    // ignore systeminformation error
                }

                const processList = Array.from(processMap.values()).map((p) => {
                    const resolvedName = procNameMap.get(p.pid) || `Process [PID ${p.pid}]`;
                    const vramMB = Number((p.vramUsedBytes / (1024 * 1024)).toFixed(2));
                    const vramGB = Number((p.vramUsedBytes / (1024 ** 3)).toFixed(2));
                    const sharedMB = Number((p.sharedVramBytes / (1024 * 1024)).toFixed(2));
                    return {
                        pid: p.pid,
                        name: resolvedName,
                        vramUsedMB: vramMB,
                        vramUsedGB: vramGB,
                        sharedVramMB: sharedMB
                    };
                });

                // Sort descending by VRAM used
                processList.sort((a, b) => b.vramUsedMB - a.vramUsedMB);

                let gpuModel = nvidiaGpuData?.name || "Unknown GPU";
                let totalVramMB = nvidiaGpuData?.totalMB || 0;
                let usedVramMB = nvidiaGpuData?.usedMB || 0;
                let freeVramMB = nvidiaGpuData?.freeMB || 0;

                if (!nvidiaGpuData) {
                    const graphicsData = await si.graphics();
                    const primaryGpu = graphicsData.controllers.length > 0 ? graphicsData.controllers[0] : null;
                    gpuModel = primaryGpu?.model || "Unknown GPU";
                    totalVramMB = primaryGpu?.vram ?? 0;
                }

                const freeMarginGB = Number((freeVramMB / 1024).toFixed(2));
                const totalVramGB = Number((totalVramMB / 1024).toFixed(2));
                const usedVramGB = Number((usedVramMB / 1024).toFixed(2));
                const usagePercentage = totalVramMB > 0 ? Number(((usedVramMB / totalVramMB) * 100).toFixed(2)) + "%" : "N/A";

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    gpuModel,
                                    totalVramMB,
                                    totalVramGB,
                                    usedVramMB,
                                    usedVramGB,
                                    freeVramMB,
                                    remainingMarginGB: freeMarginGB,
                                    vramUsagePercentage: usagePercentage,
                                    activeGpuProcessCount: processList.length,
                                    processes: processList.slice(0, limit)
                                },
                                null,
                                2
                            )
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving GPU processes: ${err.message}`
                        }
                    ]
                };
            }
        }
    );

    server.registerTool(
        "get_gpu_stats",
        {
            description: "Retrieve global graphics card (GPU) telemetry and attached display configurations. Returns GPU controller specifications, vendor, model, total VRAM (MB), real-time GPU compute utilization percentage, GPU core temperature (°C), PCIe bus interface, and connected display details (resolutions, refresh rates in Hz, connection types, and primary monitor flag). Use to monitor graphics hardware health and multi-monitor setups."
        },
        async () => {
            try {
                const graphicsData = await si.graphics();

                const gpus = graphicsData.controllers.map((gpu) => ({
                    model: gpu.model || "Unknown",
                    vendor: gpu.vendor || "Unknown",
                    vramMB: gpu.vram !== null && gpu.vram !== undefined ? gpu.vram : "N/A",
                    utilizationGpuPercentage: gpu.utilizationGpu !== null && gpu.utilizationGpu !== undefined ? gpu.utilizationGpu + "%" : "N/A",
                    temperatureC: gpu.temperatureGpu !== null && gpu.temperatureGpu !== undefined ? gpu.temperatureGpu + "°C" : "N/A",
                    bus: gpu.bus || "N/A"
                }));

                const displays = graphicsData.displays.map((d) => ({
                    model: d.model || "Unknown",
                    vendor: d.vendor || "Unknown",
                    resolutionX: d.resolutionX ?? "N/A",
                    resolutionY: d.resolutionY ?? "N/A",
                    currentResolution: d.resolutionX && d.resolutionY ? `${d.resolutionX}x${d.resolutionY}` : "N/A",
                    refreshRateHz: d.currentRefreshRate ?? "N/A",
                    connection: d.connection || "N/A",
                    main: d.main ?? false
                }));

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                { gpuCount: gpus.length, gpus, displayCount: displays.length, displays },
                                null, 2
                            )
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving GPU statistics: ${err.message}`
                        }
                    ]
                };
            }
        }
    );

    server.registerTool(
        "get_hardware_specs",
        {
            description: "Retrieve detailed physical motherboard, firmware, memory topology, and storage hardware inventory. Returns system manufacturer and model, motherboard vendor and version, BIOS firmware version and release date, RAM memory module layout (individual stick capacities in GB, DDR types, clock speeds in MHz, manufacturers, part numbers, form factors, and total installed memory), and physical drive models (SSD/NVMe/HDD names, interface types, capacities in GB, vendors, and SMART health status). Use for hardware compatibility auditing and physical inventory inspection."
        },
        async () => {
            try {
                const [baseboard, bios, memLayout, diskLayout, systemData] = await Promise.all([
                    si.baseboard(),
                    si.bios(),
                    si.memLayout(),
                    si.diskLayout(),
                    si.system()
                ]);

                const motherboard = {
                    manufacturer: baseboard.manufacturer || "Unknown",
                    model: baseboard.model || "Unknown",
                    version: baseboard.version || "N/A",
                    bios: {
                        vendor: bios.vendor || "Unknown",
                        version: bios.version || "Unknown",
                        releaseDate: bios.releaseDate || "N/A"
                    }
                };

                const systemModel = {
                    manufacturer: systemData.manufacturer || "Unknown",
                    model: systemData.model || "Unknown",
                    sku: systemData.sku || "N/A"
                };

                const ramSticks = memLayout.map((stick) => ({
                    sizeGB: Number((stick.size / (1024 ** 3)).toFixed(2)),
                    type: stick.type || "Unknown",
                    clockSpeedMHz: stick.clockSpeed || "N/A",
                    manufacturer: stick.manufacturer || "Unknown",
                    partNum: stick.partNum ? stick.partNum.trim() : "N/A",
                    formFactor: stick.formFactor || "N/A"
                }));

                const storageDrives = diskLayout.map((disk) => ({
                    name: disk.name || "Unknown",
                    type: disk.type || "Unknown",
                    interfaceType: disk.interfaceType || "N/A",
                    sizeGB: Number((disk.size / (1024 ** 3)).toFixed(2)),
                    vendor: disk.vendor || "Unknown",
                    smartStatus: disk.smartStatus || "N/A"
                }));

                const hardwareSpecs = {
                    systemModel,
                    motherboard,
                    ramLayout: {
                        totalSticks: ramSticks.length,
                        totalCapacityGB: ramSticks.reduce((sum, s) => sum + s.sizeGB, 0),
                        sticks: ramSticks
                    },
                    physicalDrives: {
                        count: storageDrives.length,
                        drives: storageDrives
                    }
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(hardwareSpecs, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving hardware specifications: ${err.message}`
                        }
                    ]
                };
            }
        }
    );

    server.registerTool(
        "get_usb_devices",
        {
            description: "Inspect all currently attached USB peripherals, external controllers, and integrated USB devices. Categorizes devices by type (Keyboards, Mice, Cameras/Webcams, Audio Devices/DACs/Microphones, Storage/Flash Drives, Bluetooth/Wireless Adapters, Game Controllers, Hubs, Card Readers, Printers), provides a category breakdown summary, and distinguishes removable external devices from permanent internal USB buses with power draw (Watts) and vendor details. Use to verify plugged-in hardware peripherals."
        },
        async () => {
            try {
                const usbList = await si.usb();

                function categorize(name: string, type: string): string {
                    const combined = (name + " " + type).toLowerCase();
                    if (combined.includes("hub")) return "Hub";
                    if (combined.includes("keyboard")) return "Keyboard";
                    if (combined.includes("mouse") || combined.includes("pointer")) return "Mouse";
                    if (combined.includes("camera") || combined.includes("webcam") || combined.includes("video")) return "Camera / Webcam";
                    if (combined.includes("audio") || combined.includes("sound") || combined.includes("headset") || combined.includes("microphone") || combined.includes("dac") || combined.includes("speaker")) return "Audio Device";
                    if (combined.includes("storage") || combined.includes("disk") || combined.includes("drive") || combined.includes("flash") || combined.includes("mass storage")) return "Storage";
                    if (combined.includes("bluetooth")) return "Bluetooth Adapter";
                    if (combined.includes("wireless") || combined.includes("wifi") || combined.includes("wlan")) return "Wireless Adapter";
                    if (combined.includes("gamepad") || combined.includes("controller") || combined.includes("joystick") || combined.includes("xinput")) return "Game Controller";
                    if (combined.includes("printer")) return "Printer";
                    if (combined.includes("card reader") || combined.includes("smart card")) return "Card Reader";
                    return "Other";
                }

                const devices = usbList.map((device) => {
                    const name = (device.name || "").trim();
                    const vendor = (device.vendor || device.manufacturer || "").trim();
                    const type = (device.type || "").trim();

                    return {
                        name: name || "Unknown Device",
                        vendor: vendor || "Unknown Vendor",
                        category: categorize(name, type),
                        type: type || "N/A",
                        removable: device.removable ?? null,
                        maxPowerWatts: device.maxPower
                            ? Number((parseFloat(device.maxPower) / 1000).toFixed(2))
                            : null,
                        id: device.id || "N/A",
                        serialNumber: device.serialNumber ? device.serialNumber.trim() : null
                    };
                });

                const categorySummary = devices.reduce((acc: Record<string, number>, d) => {
                    acc[d.category] = (acc[d.category] || 0) + 1;
                    return acc;
                }, {});

                // Separate removable and non-removable
                const removableDevices = devices.filter(d => d.removable === true);
                const nonRemovableDevices = devices.filter(d => d.removable === false || d.removable === null);

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                totalConnected: devices.length,
                                categorySummary,
                                removable: {
                                    count: removableDevices.length,
                                    devices: removableDevices
                                },
                                permanent: {
                                    count: nonRemovableDevices.length,
                                    devices: nonRemovableDevices
                                }
                            }, null, 2)
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving USB devices: ${err.message}`
                        }
                    ]
                };
            }
        }
    );
}
