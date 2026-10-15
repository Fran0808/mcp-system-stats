import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(root, "node_modules", ".package-test-"));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check with npm run test:package");
const npm = args => execFileSync(process.execPath, [npmCli, ...args], {
    cwd: root, encoding: "utf8", timeout: 120000, windowsHide: true
});
let client;
let transport;
try {
    const packed = npm(["pack", "--json", "--foreground-scripts=false", "--pack-destination", directory]);
    const report = JSON.parse(packed);
    const pack = Array.isArray(report) ? report[0] : Object.values(report)[0];
    assert.ok(pack.files.some(file => file.path === "build/index.js"));
    assert.ok(pack.files.every(file => /^(build\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/.test(file.path)), "Unexpected file in published package");
    npm(["install", join(directory, pack.filename), "--prefix", directory, "--ignore-scripts", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund", "--fetch-retries=0", "--fetch-timeout=20000"]);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const installed = join(directory, "node_modules", ...pkg.name.split("/"));
    const installedPackage = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
    assert.equal(installedPackage.version, pkg.version);
    assert.equal(installedPackage.dependencies["@modelcontextprotocol/sdk"], undefined);
    const requireFromPackage = createRequire(join(installed, "package.json"));
    for (const dependency of Object.keys(installedPackage.dependencies)) {
        assert.ok(requireFromPackage.resolve(dependency).startsWith(directory + sep), `${dependency} must resolve inside the isolated installation`);
    }
    transport = new StdioClientTransport({ command: process.execPath, args: [join(installed, "build", "index.js")], stderr: "pipe" });
    client = new Client({ name: "package-smoke-test", version: "1.0.0" });
    const timer = setTimeout(() => { void client.close(); }, 15000);
    try {
        await client.connect(transport);
        assert.equal(client.getServerVersion().version, pkg.version);
        const tools = await client.listTools();
        assert.equal(tools.tools.length, 18);
        assert.ok(tools.tools.every(tool => tool.annotations?.readOnlyHint && tool.outputSchema));
        assert.equal((await client.listResources()).resources.length, 4);
        assert.equal((await client.listPrompts()).prompts.length, 4);
        const result = await client.callTool({ name: "get_memory_status", arguments: { unit: "MB" } });
        assert.ok(!result.isError);
        assert.ok(result.structuredContent.total > 0);
        assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    } finally { clearTimeout(timer); }
    console.log(`Installed package ${pkg.name}@${pkg.version}: stdio, version, schemas, tools, resources and prompts passed`);
} finally {
    await client?.close();
    await transport?.close();
    // Never recursively remove a computed path unless it is inside our workspace.
    if (!resolve(directory).startsWith(resolve(root, "node_modules") + sep)) throw new Error("Unsafe temporary path");
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
