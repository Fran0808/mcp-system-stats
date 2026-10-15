import { registerTool } from "./register.js";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import si from "systeminformation";
import { collectGpuProcesses } from "./gpu.js";
import { getHardwareSnapshot } from "../collectors.js";

export function registerHardwareTools(server: McpServer) {
    registerTool(server,
        "get_gpu_processes",
        {
            description: "Analyze per-process graphics memory (VRAM) utilization and evaluate GPU memory headroom. Returns GPU model, total VRAM (MB/GB), used VRAM, free VRAM, remaining VRAM margin (GB), overall VRAM usage percentage, and a ranked list of active processes using the GPU with PID, application name, dedicated VRAM (MB/GB), and shared VRAM (MB). Use to identify memory-heavy AI models (e.g. Ollama, PyTorch, Stable Diffusion, LM Studio), 3D renderers, or games, and determine if sufficient VRAM remains to load new models without out-of-memory errors.",
            inputSchema: z.object({
                gpuId: z.string().optional().describe("GPU UUID or index from gpus. Defaults to the first adapter; process memory is never mixed across GPUs."),
                limit: z.number().int().min(1).max(50).optional().default(15).describe("Maximum number of top VRAM-consuming processes to return (1 to 50, default: 15).")
            })
        },
        async ({ limit, gpuId }) => {
            const data = await collectGpuProcesses(gpuId, limit);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
    );

    registerTool(server,
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

    registerTool(server,
        "get_hardware_specs",
        {
            description: "Retrieve detailed physical motherboard, firmware, memory topology, and storage hardware inventory. Returns system manufacturer and model, motherboard vendor and version, BIOS firmware version and release date, RAM memory module layout (individual stick capacities in GB, DDR types, clock speeds in MHz, manufacturers, part numbers, form factors, and total installed memory), and physical drive models (SSD/NVMe/HDD names, interface types, capacities in GB, vendors, and SMART health status). Use for hardware compatibility auditing and physical inventory inspection."
        },
        async () => {
            try {
                const { baseboard, bios, memLayout, diskLayout, systemData, sampledAt } = await getHardwareSnapshot();

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
                    sampledAt,
                    source: "systeminformation",
                    measurementStatus: ramSticks.length && storageDrives.length ? "available" : "partial",
                    measurements: {
                        memoryLayout: ramSticks.length ? "available" : "unavailable",
                        storageLayout: storageDrives.length ? "available" : "unavailable"
                    },
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

    registerTool(server,
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
