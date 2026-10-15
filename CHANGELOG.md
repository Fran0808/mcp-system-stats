# Changelog

## 2.0.0 (unreleased)

### Breaking changes

- Require Node.js 22.14+ (22.x), 24.x, or 26+. Node.js 20 and 23 are no longer supported.
- Missing CPU load and GPU memory use `null`, not fabricated zeroes. Health can be `UNKNOWN`; partial measurements include alerts.
- Windows-only startup/software inventories return explicit unsupported-platform errors elsewhere. Query failures return structured errors instead of empty successful lists.
- Fractional record limits are rejected. Disk free space now means space available to the current user; reserved blocks are reported separately.
- Import the side-effect-free `createServer()` from `build/server.js` for programmatic use. `build/index.js` is the executable entry point.

### Fixes

- Match the MCP handshake version to package.json automatically.
- Sample all network adapters, exclude loopbacks by metadata, preserve names such as `wlo1`, and correct bytes/second to Mbps conversion.
- Parse NVIDIA output per GPU and associate process memory by UUID. Never mix adapters or substitute missing VRAM with zero. Report process coverage explicitly.
- Bound direct PowerShell/NVIDIA commands, hide Windows helper windows, use argument arrays instead of shell command strings, and preserve query failures.
- Remove the ACPI thermal-zone fallback that could be mistaken for CPU temperature. Use measured current CPU frequency when available.
- Share health collection between tools/resources and cache static hardware inventory.

### Additions and maintenance

- Add `get_performance_diagnostics` for fresh temporal CPU/RAM samples, disk I/O rates, volume capacity, and sustained-pressure findings.
- Advertise per-tool output schemas and read-only annotations; return matching structured and textual JSON.
- Replace SDK v1 with server/client v2; the client is development-only. Update runtime and development dependencies and remove obsolete transitive dependencies.
- Separate deterministic regression tests from hardware integration tests; close MCP connections after each test and remove blanket CI skips.
- Test Windows, Linux, macOS and supported Node versions, including the minimum Node version. Verify the actual installed tarball and tag/package/lock/runtime version alignment.
- Build automatically before packaging. Prepare npm OIDC trusted publishing and weekly dependency update checks.

Published 1.x versions and tags remain unchanged. Version 1.4.4 is the previous npm release; no 2.0.0 package is published by these local changes.
