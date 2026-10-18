# Package and publish the System Stats skill

The source of the skill is `skills/system-stats/` in this repository. It complements the existing MCP server. The server's npm package and its version are maintained separately; adding skill documentation does not require a server runtime release.

## Listing draft

- **Title:** System Stats - Local Performance Diagnostics
- **Suggested price:** Free, matching this project's visibility goal.
- **Category/tags:** Testing & Debugging; system diagnostics, MCP, CPU, RAM, GPU, local performance.
- **Short description:** Diagnose local slowdowns with measured CPU/RAM samples, process rankings, disk capacity and GPU telemetry, with explicit limits when sensors are unavailable.
- **Requirements to show prominently:** A desktop or CLI agent that can access the locally configured `@fran0808/system-stats` MCP server; supported Node.js; first-run npm access for the npx templates. Loading the skill alone does not connect the server. Cloud-only chats without local tools cannot inspect your PC.
- **Compatibility statement:** The skill requires an agent that can load its instructions and call a local stdio MCP server. Setup explains generic launch values, then separate examples for Cursor, Claude Desktop, Claude Code and Codex. Do not mark a client as end-to-end tested until the checks below have actually passed in that client.
- **License:** MIT; the skill includes the repository license. This is an original companion to the author's open-source MCP server.

The skill does not promise automatic repairs, an internet speed test, drive failure prediction, or proof of thermal throttling. Explain that the MCP queries the host where it runs, which can be remote.

## Build the ZIP

From the repository root, in PowerShell:

```powershell
New-Item -ItemType Directory -Path dist -Force | Out-Null
Compress-Archive -LiteralPath skills/system-stats -DestinationPath dist/system-stats-skill.zip -Force
```

On macOS/Linux with the zip utility installed:

```bash
mkdir -p dist
(cd skills && zip -r ../dist/system-stats-skill.zip system-stats -x '*/.DS_Store' '*/Thumbs.db')
```

Inspect the resulting ZIP before uploading. It must contain one `system-stats/` directory, with `SKILL.md` directly inside. Include only the skill files, references, example, config templates and license. Do not include the entire repository, node_modules, build output, credentials, real telemetry, or nested copies of the skill. `dist/` is already ignored by Git.

## Structural and behavioral validation

Validate the frontmatter with the skill-creator validator when available, parse both JSON templates, and check that relative Markdown links resolve inside the package. These are packaging checks, not a certification from Agensi.

Run each scenario through the actual target client, using the skill with the local server connected. Repeat key cases with only the MCP, without this skill, to check whether the instructions improve tool selection, accuracy, or clarity.

| Scenario | Expected observable behavior |
|---|---|
| "Mi PC esta lenta" / "Why is my computer slow?" | Temporal samples, targeted process ranking, measured window and limitations |
| "Show my RAM usage" | A narrow memory query, not a complete hardware inventory |
| "Who is using GPU memory?" | GPU identity/coverage checked; no merging across adapters |
| "There is zero network traffic" | No claim of an outage from zero traffic alone |
| "My disk is 90% full; is it slow?" | Capacity warning separated from evidence of latency/saturation |
| CPU temperature unavailable | Missing sensor stated, no invented temperature |
| Startup inventory requested on macOS/Linux | Windows-only limitation, no repeated unsupported calls |
| MCP disconnected | Setup guidance, no invented measurements |
| "Fix the memory leak in this TypeScript code" | Does not activate merely because the request contains "memory" |
| "Close all heavy applications" | Does not treat the diagnostic skill as permission for system changes |

For unavailable hardware cases, use explicitly labeled fixtures in a controlled evaluation; do not imply real hardware was measured. Record the client/version, server version, host platform, prompt, calls, output quality, and pass/fail. Automated server tests do not prove the skill triggers reliably in a client.

## Verification recorded on 2026-10-18

- Skill-creator `quick_validate.py`: passed.
- YAML metadata, both JSON templates, package-relative Markdown links, and ZIP CRC/content checks: passed. The ZIP contains eight text files under one `system-stats/` folder.
- Existing server unit tests: 35 passed. Existing server TypeScript typecheck: passed.
- npm registry: version `@fran0808/system-stats@2.0.1` resolved successfully.
- Windows configuration command: launched the published npm version, completed the MCP handshake, listed all 18 tools, and returned successful live RAM and two-sample temporal diagnostics using an SDK client. No hardware identifiers or actual measurements were included in the skill or example files.
- Not yet verified: skill activation and report quality inside Cursor, Claude Desktop, Claude Code or Codex; macOS/Linux launches; Agensi review and access to supporting files through its delivery service. The SDK connection check does not establish those results.

## Submission

Upload `dist/system-stats-skill.zip` through the current Creator Dashboard, choose Free, and review the listing draft. Agensi also documents creator tools through its own MCP connection; configuring that connection is separate from configuring system-stats.

Before claiming readiness, verify the published npm version starts on a fresh client and that the Agensi delivery route exposes the supporting references/templates. Do not assume an Agensi-loaded skill is saved to a local folder. If supporting files are not accessible, resolve the delivery issue before relying on them for setup.

Agensi documents automated security checks followed by review; the advertised 24-48 hours is an estimate, not guaranteed approval. A submitted update also goes through their approval process. Publishing is a separate step after local preparation and testing.

## Sources checked on 2026-10-18

- [Creator publishing guide](https://www.agensi.io/learn/how-to-sell-skills-on-agensi)
- [ZIP structure and creator checklist](https://www.agensi.io/learn/skill-md-creator-checklist)
- [Supporting files](https://www.agensi.io/learn/how-to-write-skill-md-supporting-files)
- [Behavioral testing](https://www.agensi.io/learn/how-to-test-skill-md-before-publishing)
- [Current agent delivery](https://www.agensi.io/mcp)
