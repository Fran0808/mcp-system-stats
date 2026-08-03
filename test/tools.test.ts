import { describe, it, expect, beforeAll } from "vitest";
import { server } from "../src/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

type TextContent = { type: "text"; text: string };

async function createConnectedClient() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} }
    );

    await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport)
    ]);

    return client;
}

async function callToolAndParse(client: Client, name: string, args?: Record<string, unknown>) {
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as TextContent[];
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
    return JSON.parse(content[0].text);
}

// ─── Tool Registration ─────────────────────────────────────────────────────────

describe("Tool Registration", () => {
    const EXPECTED_TOOLS = [
        "get_system_overview",
        "get_memory_status",
        "get_disk_space",
        "get_top_processes",
        "get_network_info",
        "get_network_speed",
        "get_gpu_stats",
        "get_battery_status",
        "get_system_health",
        "get_cpu_stats",
        "search_process",
        "get_hardware_specs",
        "get_usb_devices"
    ];

    it("should register all 13 tools", async () => {
        const client = await createConnectedClient();
        const toolsResult = await client.listTools();
        const toolNames = toolsResult.tools.map((t) => t.name);

        expect(toolsResult.tools.length).toBe(EXPECTED_TOOLS.length);
        for (const name of EXPECTED_TOOLS) {
            expect(toolNames).toContain(name);
        }
    });

    it("every tool should have a non-empty description", async () => {
        const client = await createConnectedClient();
        const toolsResult = await client.listTools();

        for (const tool of toolsResult.tools) {
            expect(tool.description, `Tool '${tool.name}' missing description`).toBeTruthy();
            expect(tool.description!.length).toBeGreaterThan(10);
        }
    });
});

// ─── Prompt Registration ────────────────────────────────────────────────────────

describe("Prompt Registration", () => {
    const EXPECTED_PROMPTS = [
        "diagnose-system",
        "hardware-report",
        "network-check",
        "performance-bottleneck"
    ];

    it("should register all 4 prompts", async () => {
        const client = await createConnectedClient();
        const promptsResult = await client.listPrompts();
        const promptNames = promptsResult.prompts.map((p) => p.name);

        expect(promptsResult.prompts.length).toBe(EXPECTED_PROMPTS.length);
        for (const name of EXPECTED_PROMPTS) {
            expect(promptNames).toContain(name);
        }
    });

    it("diagnose-system should return a valid prompt message", async () => {
        const client = await createConnectedClient();
        const result = await client.getPrompt({ name: "diagnose-system" });

        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.messages[0].role).toBe("user");

        const text = (result.messages[0].content as { type: string; text: string }).text;
        expect(text).toContain("get_system_health");
        expect(text).toContain("get_cpu_stats");
    });

    it("performance-bottleneck should accept focus argument", async () => {
        const client = await createConnectedClient();
        const result = await client.getPrompt({
            name: "performance-bottleneck",
            arguments: { focus: "cpu" }
        });

        const text = (result.messages[0].content as { type: string; text: string }).text;
        expect(text).toContain("focus: cpu");
        expect(text).toContain("get_cpu_stats");
    });
});


describe("System Tools", () => {
    it("get_system_overview should return valid OS and CPU data", async () => {
        const client = await createConnectedClient();
        const overview = await callToolAndParse(client, "get_system_overview");

        expect(overview.platform).toBeDefined();
        expect(["win32", "linux", "darwin"]).toContain(overview.platform);
        expect(overview.cpuCores).toBeGreaterThan(0);
        expect(overview.cpuModel).toBeDefined();
        expect(overview.hostname).toBeDefined();
        expect(overview.uptimeSeconds).toBeGreaterThan(0);
        expect(overview.uptimeFormatted).toMatch(/\d+d \d+h \d+m/);
        expect(overview.cpuLoadPercentage).toMatch(/^\d+(\.\d+)?%$/);
    });

    it("get_system_health should return status with valid thresholds", async () => {
        const client = await createConnectedClient();
        const health = await callToolAndParse(client, "get_system_health");

        expect(["HEALTHY", "WARNING", "CRITICAL"]).toContain(health.status);
        expect(health.cpuLoadPercentage).toMatch(/^\d+(\.\d+)?%$/);
        expect(health.ramLoadPercentage).toMatch(/^\d+(\.\d+)?%$/);
        expect(health.totalRamGB).toBeGreaterThan(0);
        expect(health.freeRamGB).toBeGreaterThanOrEqual(0);
        expect(health.uptimeSeconds).toBeGreaterThan(0);
        expect(Array.isArray(health.alerts)).toBe(true);
        expect(health.alerts.length).toBeGreaterThan(0);
    });

    it("get_battery_status should return battery or no-battery response", async () => {
        const client = await createConnectedClient();
        const battery = await callToolAndParse(client, "get_battery_status");

        expect(typeof battery.hasBattery).toBe("boolean");

        if (battery.hasBattery) {
            expect(battery.percent).toMatch(/^\d+(\.\d+)?%$/);
            expect(typeof battery.isCharging).toBe("boolean");
            expect(typeof battery.acConnected).toBe("boolean");
        } else {
            expect(battery.message).toContain("No battery detected");
        }
    });
});


describe("Performance Tools", () => {
    it("get_cpu_stats should return model, cores, load, and temperature", async () => {
        const client = await createConnectedClient();
        const cpu = await callToolAndParse(client, "get_cpu_stats");

        expect(cpu.model).toBeDefined();
        expect(cpu.cores).toBeGreaterThan(0);
        expect(cpu.physicalCores).toBeGreaterThan(0);
        expect(cpu.physicalCores).toBeLessThanOrEqual(cpu.cores);

        expect(cpu.speedGHz).toBeDefined();


        expect(cpu.load).toBeDefined();
        expect(cpu.load.totalPercentage).toMatch(/^\d+(\.\d+)?%$/);
        expect(Array.isArray(cpu.load.perCore)).toBe(true);
        expect(cpu.load.perCore.length).toBeGreaterThan(0);

        expect(cpu.temperature).toBeDefined();
        expect(["NORMAL", "HOT", "CRITICAL", "Unavailable"]).toContain(cpu.temperature.status);
    }, 15000);

    it("get_memory_status should return data in GB by default", async () => {
        const client = await createConnectedClient();
        const mem = await callToolAndParse(client, "get_memory_status");

        expect(mem.unit).toBe("GB");
        expect(mem.total).toBeGreaterThan(0);
        expect(mem.used).toBeGreaterThan(0);
        expect(mem.free).toBeGreaterThanOrEqual(0);
        expect(mem.used + mem.free).toBeCloseTo(mem.total, 0);
        expect(mem.usedPercentage).toMatch(/^\d+(\.\d+)?%$/);
    });

    it("get_memory_status should support MB unit", async () => {
        const client = await createConnectedClient();
        const memMB = await callToolAndParse(client, "get_memory_status", { unit: "MB" });

        expect(memMB.unit).toBe("MB");
        expect(memMB.total).toBeGreaterThan(1000);
    });

    it("get_disk_space should return valid disk usage", async () => {
        const client = await createConnectedClient();
        const disk = await callToolAndParse(client, "get_disk_space");

        expect(disk.totalGB).toBeGreaterThan(0);
        expect(disk.usedGB).toBeGreaterThan(0);
        expect(disk.freeGB).toBeGreaterThanOrEqual(0);
        expect(disk.usedPercentage).toMatch(/^\d+(\.\d+)?%$/);
        expect(disk.usedGB + disk.freeGB).toBeCloseTo(disk.totalGB, 0);
    });
});


describe("Network Tools", () => {
    it("get_network_info should return external and loopback interfaces", async () => {
        const client = await createConnectedClient();
        const net = await callToolAndParse(client, "get_network_info");

        expect(net.external).toBeDefined();
        expect(net.loopback).toBeDefined();
        expect(typeof net.external).toBe("object");
        expect(typeof net.loopback).toBe("object");

        const totalInterfaces = Object.keys(net.external).length + Object.keys(net.loopback).length;
        expect(totalInterfaces).toBeGreaterThan(0);
    });

    it("get_network_speed should measure bandwidth with sampling", async () => {
        const client = await createConnectedClient();
        const speed = await callToolAndParse(client, "get_network_speed");

        expect(speed.samplingIntervalMs).toBe(1000);
        expect(speed.busiestInterface).toBeDefined();
        expect(Array.isArray(speed.interfaces)).toBe(true);

        if (speed.interfaces.length > 0) {
            const iface = speed.interfaces[0];
            expect(iface.interface).toBeDefined();
            expect(typeof iface.downloadKBps).toBe("number");
            expect(typeof iface.uploadKBps).toBe("number");
            expect(typeof iface.downloadMbps).toBe("number");
            expect(typeof iface.uploadMbps).toBe("number");
        }
    }, 15000);
});


describe("Process Tools", () => {
    it("get_top_processes should return grouped processes by default", async () => {
        const client = await createConnectedClient();
        const procs = await callToolAndParse(client, "get_top_processes");

        expect(procs.groupedByApp).toBe(true);
        expect(procs.sortBy).toBe("cpu");
        expect(procs.count).toBeGreaterThan(0);
        expect(procs.count).toBeLessThanOrEqual(5);
        expect(Array.isArray(procs.processes)).toBe(true);

        const first = procs.processes[0];
        expect(first.name).toBeDefined();
        expect(first.instances).toBeGreaterThanOrEqual(1);
        expect(first.totalMemoryMB).toBeGreaterThan(0);
        expect(Array.isArray(first.pids)).toBe(true);
    });

    it("get_top_processes should support ungrouped mode sorted by memory", async () => {
        const client = await createConnectedClient();
        const procs = await callToolAndParse(client, "get_top_processes", {
            sortBy: "memory",
            limit: 3,
            groupByApp: false
        });

        expect(procs.groupedByApp).toBe(false);
        expect(procs.sortBy).toBe("memory");
        expect(procs.count).toBeLessThanOrEqual(3);

        if (procs.processes.length > 0) {
            expect(procs.processes[0].pid).toBeDefined();
            expect(procs.processes[0].memoryMB).toBeGreaterThan(0);
        }
    });

    it("search_process should find a running process", async () => {
        const client = await createConnectedClient();
        const result = await callToolAndParse(client, "search_process", { name: "node" });

        expect(result.query).toBe("node");
        expect(result.isRunning).toBe(true);
        expect(result.count).toBeGreaterThan(0);
        expect(result.totalCpuPercentage).toMatch(/^\d+(\.\d+)?%$/);
        expect(result.totalMemoryMB).toBeGreaterThan(0);
        expect(Array.isArray(result.instances)).toBe(true);
    });

    it("search_process should handle non-existent process", async () => {
        const client = await createConnectedClient();
        const result = await callToolAndParse(client, "search_process", {
            name: "zzz_nonexistent_process_xyz"
        });

        expect(result.query).toBe("zzz_nonexistent_process_xyz");
        expect(result.isRunning).toBe(false);
        expect(result.message).toContain("No active processes found");
    });
});


describe("Hardware Tools", () => {
    it("get_gpu_stats should return GPU and display data", async () => {
        const client = await createConnectedClient();
        const gpu = await callToolAndParse(client, "get_gpu_stats");

        expect(typeof gpu.gpuCount).toBe("number");
        expect(Array.isArray(gpu.gpus)).toBe(true);
        expect(typeof gpu.displayCount).toBe("number");
        expect(Array.isArray(gpu.displays)).toBe(true);

        if (gpu.gpus.length > 0) {
            expect(gpu.gpus[0].model).toBeDefined();
            expect(gpu.gpus[0].vendor).toBeDefined();
        }

        if (gpu.displays.length > 0) {
            expect(gpu.displays[0].currentResolution).toBeDefined();
        }
    });

    it("get_hardware_specs should return motherboard, RAM layout, and drives", async () => {
        const client = await createConnectedClient();
        const specs = await callToolAndParse(client, "get_hardware_specs");

        expect(specs.motherboard).toBeDefined();
        expect(specs.motherboard.manufacturer).toBeDefined();
        expect(specs.motherboard.bios).toBeDefined();
        expect(specs.motherboard.bios.vendor).toBeDefined();
        expect(specs.systemModel).toBeDefined();
        expect(specs.ramLayout).toBeDefined();
        expect(specs.ramLayout.totalSticks).toBeGreaterThan(0);
        expect(specs.ramLayout.totalCapacityGB).toBeGreaterThan(0);
        expect(Array.isArray(specs.ramLayout.sticks)).toBe(true);

        if (specs.ramLayout.sticks.length > 0) {
            expect(specs.ramLayout.sticks[0].sizeGB).toBeGreaterThan(0);
            expect(specs.ramLayout.sticks[0].type).toBeDefined();
        }

        expect(specs.physicalDrives).toBeDefined();
        expect(Array.isArray(specs.physicalDrives.drives)).toBe(true);
    }, 15000);

    it("get_usb_devices should return categorized devices", async () => {
        const client = await createConnectedClient();
        const usb = await callToolAndParse(client, "get_usb_devices");

        expect(typeof usb.totalConnected).toBe("number");
        expect(usb.categorySummary).toBeDefined();
        expect(typeof usb.categorySummary).toBe("object");

        const categoryTotal = Object.values(usb.categorySummary).reduce(
            (sum: number, count) => sum + (count as number), 0
        );
        expect(categoryTotal).toBe(usb.totalConnected);

        expect(usb.removable).toBeDefined();
        expect(Array.isArray(usb.removable.devices)).toBe(true);
        expect(usb.permanent).toBeDefined();
        expect(Array.isArray(usb.permanent.devices)).toBe(true);
        expect(usb.removable.count + usb.permanent.count).toBe(usb.totalConnected);
    });
});
