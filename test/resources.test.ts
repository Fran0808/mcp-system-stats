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
    it("should list system://overview resource", async () => {
        const client = await createConnectedClient();
        const resourcesList = await client.listResources();

        expect(resourcesList.resources).toBeDefined();
        const overviewRes = resourcesList.resources.find(r => r.uri === "system://overview");
        expect(overviewRes).toBeDefined();
        expect(overviewRes?.name).toBe("system-overview");
        expect(overviewRes?.mimeType).toBe("application/json");

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

        const data = JSON.parse(content.text as string);
        expect(data.platform).toBeDefined();
        expect(data.cpuModel).toBeDefined();
        expect(data.totalRamGB).toBeGreaterThan(0);
        expect(data.uptimeFormatted).toBeDefined();

        await client.close();
    });
});
