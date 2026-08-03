import type { McpServer } from "@modelcontextprotocol/server";
import si from "systeminformation";

export function registerHardwareTools(server: McpServer) {
    server.registerTool(
        "get_gpu_stats",
        {
            description: "Use this tool whenever the user asks about their local computer graphics card (GPU), VRAM memory, GPU utilization, GPU temperature, monitors, or display setup."
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
            description: "Use this tool whenever the user asks for detailed physical hardware specifications of their PC, such as motherboard model/brand, BIOS version, physical RAM sticks/slots layout (DDR type, speed, channels), or physical SSD/HDD drive models."
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
            description: "Use this tool whenever the user asks about USB devices, peripherals, or connected hardware like keyboards, mice, webcams, microphones, external drives, headsets, hubs, DACs, or controllers connected to their computer."
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
