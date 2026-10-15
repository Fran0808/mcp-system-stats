import { afterEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type McpServer } from "@modelcontextprotocol/server";
import { createServer } from "../../src/server.js";

let client: Client;
let server: McpServer;
afterEach(async () => { await client?.close(); await server?.close(); });

it("collects a temporal diagnostic from the actual host with explicit I/O availability", async () => {
    server = createServer();
    client = new Client({ name: "diagnostic-integration", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
    const result = await client.callTool({ name: "get_performance_diagnostics", arguments: { samples: 2, intervalMs: 250 } });
    expect(result.isError).not.toBe(true);
    const text = result.content.find(item => item.type === "text");
    if (!text || text.type !== "text") throw new Error("Missing JSON content");
    const data = JSON.parse(text.text);
    expect(result.structuredContent).toEqual(data);
    expect(data.samples).toHaveLength(2);
    expect(data.elapsedMs).toBeGreaterThanOrEqual(250);
    expect(Date.parse(data.samples[1].sampledAt)).toBeGreaterThan(Date.parse(data.samples[0].sampledAt));
    for (const sample of data.samples) {
        for (const rate of [sample.diskIO.readOperationsPerSecond, sample.diskIO.writeOperationsPerSecond]) {
            if (rate !== null) expect(rate).toBeGreaterThanOrEqual(0);
        }
    }
    expect(data.summary.diskReadOperationsPerSecond.sustainedPressure).toBeNull();
    expect(data.summary.findings.length).toBeGreaterThan(0);
});
