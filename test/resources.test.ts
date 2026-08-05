import { describe, it, expect } from "vitest";
import { server } from "../src/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

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

describe("MCP Resources", () => {
    it("should list all 4 system resources", async () => {
        const client = await createConnectedClient();
        const resourcesList = await client.listResources();

        expect(resourcesList.resources).toBeDefined();
        expect(resourcesList.resources.length).toBe(4);

        const uris = resourcesList.resources.map(r => r.uri);
        expect(uris).toContain("system://overview");
        expect(uris).toContain("system://health");
        expect(uris).toContain("system://hardware");
        expect(uris).toContain("system://live-stats");

        await client.close();
    });

    it("should read system://overview resource and return valid JSON", async () => {
        const client = await createConnectedClient();
        const res = await client.readResource({ uri: "system://overview" });

        expect(res.contents).toBeDefined();
        expect(res.contents.length).toBeGreaterThan(0);

        const content = res.contents[0];
        expect(content.uri).toBe("system://overview");
        expect(content.mimeType).toBe("application/json");
        expect("text" in content).toBe(true);

        if (!("text" in content)) {
            throw new Error("Expected text resource content");
        }

        const data = JSON.parse(content.text);
        expect(data.platform).toBeDefined();
        expect(data.cpuModel).toBeDefined();
        expect(data.totalRamGB).toBeGreaterThan(0);
        expect(data.uptimeFormatted).toBeDefined();

        await client.close();
    });

    it("should read system://health resource and return diagnostic report", async () => {
        const client = await createConnectedClient();
        const res = await client.readResource({ uri: "system://health" });

        expect(res.contents).toBeDefined();
        expect(res.contents.length).toBeGreaterThan(0);

        const content = res.contents[0];
        expect(content.uri).toBe("system://health");
        expect(content.mimeType).toBe("application/json");
        expect("text" in content).toBe(true);

        if (!("text" in content)) {
            throw new Error("Expected text resource content");
        }

        const data = JSON.parse(content.text);
        expect(["HEALTHY", "WARNING", "CRITICAL"]).toContain(data.status);
        expect(data.cpuLoadPercentage).toBeDefined();
        expect(data.ramLoadPercentage).toBeDefined();
        expect(Array.isArray(data.alerts)).toBe(true);

        await client.close();
    });

    it("should read system://hardware resource and return hardware inventory", async () => {
        const client = await createConnectedClient();
        const res = await client.readResource({ uri: "system://hardware" });

        expect(res.contents).toBeDefined();
        expect(res.contents.length).toBeGreaterThan(0);

        const content = res.contents[0];
        expect(content.uri).toBe("system://hardware");
        expect(content.mimeType).toBe("application/json");
        expect("text" in content).toBe(true);

        if (!("text" in content)) {
            throw new Error("Expected text resource content");
        }

        const data = JSON.parse(content.text);
        expect(data.motherboard).toBeDefined();
        expect(data.ram).toBeDefined();
        expect(data.storage).toBeDefined();
        expect(data.graphics).toBeDefined();

        await client.close();
    });

    it("should read system://live-stats resource and return Markdown dashboard", async () => {
        const client = await createConnectedClient();
        const res = await client.readResource({ uri: "system://live-stats" });

        expect(res.contents).toBeDefined();
        expect(res.contents.length).toBeGreaterThan(0);

        const content = res.contents[0];
        expect(content.uri).toBe("system://live-stats");
        expect(content.mimeType).toBe("text/markdown");
        expect("text" in content).toBe(true);

        if (!("text" in content)) {
            throw new Error("Expected text resource content");
        }

        expect(content.text).toContain("# System Live Stats Dashboard");
        expect(content.text).toContain("Status:");

        await client.close();
    });
});
