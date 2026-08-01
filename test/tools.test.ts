import { describe, it, expect } from "vitest";
import { server } from "../src/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

type TextContent = { type: "text"; text: string };

describe("MCP System Stats Server Tools", () => {
    it("should register all tools correctly", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

        const client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);

        const toolsResult = await client.listTools();
        expect(toolsResult.tools.length).toBeGreaterThan(0);

        const toolNames = toolsResult.tools.map((t) => t.name);
        expect(toolNames).toContain("get_system_overview");
        expect(toolNames).toContain("get_memory_status");
        expect(toolNames).toContain("get_disk_space");
        expect(toolNames).toContain("get_top_processes");
        expect(toolNames).toContain("get_network_info");
        expect(toolNames).toContain("search_process");
        expect(toolNames).toContain("get_gpu_stats");
        expect(toolNames).toContain("get_battery_status");
        expect(toolNames).toContain("get_system_health");
        expect(toolNames).toContain("get_cpu_stats");
        expect(toolNames).toContain("get_network_speed");
        expect(toolNames).toContain("get_hardware_specs");
    });

    it("should return system overview data", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);

        const res = await client.callTool({ name: "get_system_overview" });
        const content = res.content as TextContent[];
        expect(content).toBeDefined();
        expect(content.length).toBeGreaterThan(0);

        const overview = JSON.parse(content[0].text);
        expect(overview.platform).toBeDefined();
        expect(overview.cpuCores).toBeGreaterThan(0);
    });

    it("should return memory status", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);

        const res = await client.callTool({
            name: "get_memory_status",
            arguments: { unit: "GB" }
        });
        const content = res.content as TextContent[];
        const mem = JSON.parse(content[0].text);
        expect(mem.unit).toBe("GB");
        expect(mem.total).toBeGreaterThan(0);
        expect(mem.free).toBeGreaterThanOrEqual(0);
    });

    it("should return system health report", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);

        const res = await client.callTool({ name: "get_system_health" });
        const content = res.content as TextContent[];
        const health = JSON.parse(content[0].text);
        expect(["HEALTHY", "WARNING", "CRITICAL"]).toContain(health.status);
    });

    it("should return cpu stats with load and temperature", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);

        const res = await client.callTool({ name: "get_cpu_stats" });
        const content = res.content as TextContent[];
        const cpu = JSON.parse(content[0].text);

        expect(cpu.model).toBeDefined();
        expect(cpu.cores).toBeGreaterThan(0);
        expect(cpu.load).toBeDefined();
        expect(cpu.load.totalPercentage).toBeDefined();
        expect(Array.isArray(cpu.load.perCore)).toBe(true);
        expect(cpu.temperature).toBeDefined();
    }, 15000);

    it("should return network speed with interface breakdown", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);

        const res = await client.callTool({ name: "get_network_speed" });
        const content = res.content as TextContent[];
        const speed = JSON.parse(content[0].text);

        expect(speed.samplingIntervalMs).toBe(1000);
        expect(speed.busiestInterface).toBeDefined();
        expect(Array.isArray(speed.interfaces)).toBe(true);
    }, 15000);

    it("should return detailed hardware specifications", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport)
        ]);

        const res = await client.callTool({ name: "get_hardware_specs" });
        const content = res.content as TextContent[];
        const specs = JSON.parse(content[0].text);

        expect(specs.motherboard).toBeDefined();
        expect(specs.motherboard.manufacturer).toBeDefined();
        expect(specs.ramLayout).toBeDefined();
        expect(Array.isArray(specs.ramLayout.sticks)).toBe(true);
        expect(specs.physicalDrives).toBeDefined();
        expect(Array.isArray(specs.physicalDrives.drives)).toBe(true);
    }, 15000);
});
