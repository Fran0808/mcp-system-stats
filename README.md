# MCP System Stats

[![npm version](https://img.shields.io/npm/v/@fran0808/system-stats.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@fran0808/system-stats)
[![CI Build](https://github.com/Fran0808/mcp-system-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/Fran0808/mcp-system-stats/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server providing real-time local system statistics, CPU performance and thermal metrics, RAM usage, disk storage, network bandwidth, GPU status, and process monitoring for LLM assistants.

---

## Supported Clients

This MCP Server works with any client supporting the Model Context Protocol:

| Client | Setup Reference |
|---|---|
| **Claude Desktop** | [Claude MCP Documentation](https://modelcontextprotocol.io/quickstart/user) |
| **Cursor** | [Cursor MCP Documentation](https://docs.cursor.com/context/model-context-protocol) |
| **Windsurf** | [Windsurf MCP Documentation](https://docs.codeium.com/windsurf/mcp) |
| **VS Code (GitHub Copilot)** | [VS Code MCP Documentation](https://code.visualstudio.com/docs/copilot/mcp) |

---

## Quick Start & Setup

Requires **Node.js 22.14+ (22.x), 24.x, or 26+**. Version 2 drops Node.js 20 and 23 support.

### Step 1: Choose How You Want to Run It

You have two simple ways to use this MCP server:

* **Option A: Instant Run via `npx` (Recommended - No installation required)**  
  Your AI assistant will automatically fetch and run the latest version on demand without cluttering your system.

* **Option B: Permanent Global Installation via `npm`**  
  If you prefer downloading and saving the package permanently on your machine, run this command in your terminal:
  ```bash
  npm install -g @fran0808/system-stats
  ```

---

### Step 2: Add the Configuration to Your AI Assistant

Open the configuration file for your AI application (Cursor, Claude Desktop, Windsurf, or VS Code) and add the JSON block below:

#### 🔹 Cursor
Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "system-stats": {
      "command": "npx",
      "args": ["-y", "@fran0808/system-stats"]
    }
  }
}
```
*(If you installed globally via Option B, change `"command"` to `"system-stats"` and remove `"args"`).*

#### 🔹 Claude Desktop
Add to `claude_desktop_config.json`:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "system-stats": {
      "command": "npx",
      "args": ["-y", "@fran0808/system-stats"]
    }
  }
}
```

#### 🔹 Windsurf
Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "system-stats": {
      "command": "npx",
      "args": ["-y", "@fran0808/system-stats"]
    }
  }
}
```

---

## Features

- **Real-Time System Overview:** Instant OS, kernel, uptime, and CPU hardware details.
- **CPU Stats and Temperature:** Comprehensive CPU load per core, frequency specifications, and thermal readings with an optional LibreHardwareMonitor fallback on Windows. Missing CPU sensors are reported as unavailable; ACPI thermal zones are not treated as CPU temperatures.
- **Task-Manager-Style Process Aggregation:** Group top processes by application name (e.g. `brave.exe`, `code.exe`) with total memory, CPU utilization, and instance counts matching Windows Task Manager.
- **Live Network Bandwidth:** Sample real-time download and upload speeds (KB/s and Mbps) per active interface.
- **GPU and Displays:** Detect graphics cards, VRAM utilization, GPU temperatures, and connected monitors with resolution/refresh rates.
- **Robust Diagnostics:** Overall system health check with automated alerts for high CPU or RAM pressure.
- **Measurement Quality:** Timestamped diagnostics, explicit missing/unsupported telemetry, validated structured outputs, and read-only MCP annotations.
- **Regression Coverage:** Deterministic unit tests plus separate hardware integration and installed-package tests in GitHub Actions.

---

## Available MCP Tools

| Tool Name | Description | Key Inputs |
|---|---|---|
| `get_system_overview` | OS platform, release, hostname, username, uptime, and CPU load. | None |
| `get_cpu_stats` | CPU specifications, speed (GHz), per-core load, and temperature. | None |
| `get_memory_status` | Total, free, and used RAM with utilization percentage. | `unit`: `"GB"` \| `"MB"` |
| `get_disk_space` | Disk capacity, free storage, used space, and usage percentage. | `path`: string (default `"C:\\"` or `"/"`) |
| `get_top_processes` | Top resource-heavy applications grouped by name or PID. | `sortBy`: `"memory"` \| `"cpu"`, `limit`: `1..50`, `groupByApp`: `boolean` |
| `search_process` | Search if a specific app (`chrome`, `node`, `docker`) is running. | `name`: string |
| `get_network_info` | Network interfaces, IPv4/IPv6 addresses, MAC, and internal flags. | None |
| `get_network_speed` | Real-time download/upload speed (KB/s and Mbps) per interface. | None |
| `get_gpu_stats` | GPU controllers, VRAM MB, utilization %, temperature, and displays. | None |
| `get_battery_status` | Laptop battery %, charging state, AC power, and health %. | None |
| `get_system_health` | Comprehensive health check status (`HEALTHY`, `WARNING`, `CRITICAL`, `UNKNOWN`). | None |
| `get_hardware_specs` | Detailed physical hardware specs (Motherboard, BIOS, RAM sticks layout, physical SSD/HDD models). | None |
| `get_usb_devices` | All connected USB peripherals categorized by type (keyboard, mouse, webcam, storage, audio, hub). | None |
| `get_gpu_processes` | VRAM per selected GPU; process data includes adapter identity and telemetry availability. | `gpuId`: UUID or index, `limit`: `1..50` |
| `get_services` | Windows/Linux: background services and execution status (`Running`/`Stopped`), with start mode when available. Full enumeration is unsupported on macOS; use `search_process` for a known process. | `status`: `"all"` \| `"running"` \| `"stopped"`, `search`: string, `limit`: `1..100` |
| `get_startup_programs` | Windows only: programs configured to launch on system startup (Task Manager Startup tab, Registry Run, Startup Folder). | `search`: string, `limit`: `1..50` |
| `get_installed_programs` | Windows only: installed software applications catalog with version, publisher, install date, estimated size (MB/GB), and install directory. | `search`: string, `sortBy`: `"name"` \| `"installDate"` \| `"size"`, `order`: `"asc"` \| `"desc"`, `limit`: `1..100` |
| `get_performance_diagnostics` | Compare CPU/RAM pressure and disk I/O over multiple samples, with mounted-volume capacity and explicit missing data. | `samples`: `2..5` (default 3), `intervalMs`: `250..2000` (default 1000) |

---

## Available MCP Resources

MCP Resources allow LLM clients (Cursor, Claude Desktop, Windsurf, VS Code Copilot) to directly read or attach live system metrics as context (`system://...`).

| Resource URI | Resource Name | MIME Type | Description |
|---|---|---|---|
| `system://overview` | `system-overview` | `application/json` | Real-time summary of OS platform, CPU model, core counts, RAM, uptime, and identity. |
| `system://health` | `system-health` | `application/json` | Real-time diagnostic health check status (`HEALTHY`, `WARNING`, `CRITICAL`, `UNKNOWN`) and alerts. |
| `system://hardware` | `system-hardware` | `application/json` | Complete physical hardware specs (Motherboard, BIOS, RAM sticks layout, SSD/HDDs, GPUs). |
| `system://live-stats` | `system-live-stats` | `text/markdown` | Formatted Markdown dashboard ready for direct LLM context injection (`@system://live-stats`). |

---

## Sample Tool Outputs

### `get_cpu_stats`
```json
{
  "model": "Intel Core i7-12700F",
  "cores": 20,
  "physicalCores": 12,
  "speedGHz": { "current": 2.1, "min": 2.1, "max": 2.1 },
  "load": {
    "totalPercentage": "33.15%",
    "userPercentage": "18.14%",
    "systemPercentage": "14.6%",
    "idlePercentage": "66.85%",
    "perCore": [{ "core": 0, "loadPercentage": "47.25%" }]
  },
  "temperature": {
    "mainC": "N/A",
    "maxC": "N/A",
    "status": "Unavailable",
    "sensorSource": "Unavailable",
    "perCore": []
  }
}
```

### `get_top_processes` (Grouped by Application)
```json
{
  "sortBy": "memory",
  "groupedByApp": true,
  "count": 3,
  "processes": [
    {
      "name": "brave.exe",
      "instances": 22,
      "totalMemoryMB": 2588.9,
      "totalCpuPercentage": "1.42%",
      "pids": [29084, 22128, 25652]
    },
    {
      "name": "code.exe",
      "instances": 19,
      "totalMemoryMB": 2005.2,
      "totalCpuPercentage": "0.2%",
      "pids": [1402, 5912]
    }
  ]
}
```

---

## Local Development and Testing

Clone the repository and install dependencies:

```bash
git clone https://github.com/Fran0808/mcp-system-stats.git
cd mcp-system-stats
npm ci
```

### Build
Compile TypeScript to JavaScript (`build/`):
```bash
npm run build
```

### Run Tests
Run deterministic tests (no hardware commands):
```bash
npm test
```

---

### Integration and package checks

```bash
npm run typecheck
npm run build
npm run test:integration
npm run test:package
npm run check:release
npm audit
```

Integration tests query real hardware and are run on Windows, Linux and macOS in CI. Hardware availability depends on OS, drivers, permissions and virtualization. No tests are skipped merely because `CI` is set. The package check builds a tarball, installs it with production dependencies into a temporary directory, and tests its actual stdio entry point.

## Migrating from 1.x to 2.0

- The package and MCP handshake now share the same version. The server requires Node.js 22.14+ on the 22.x line, 24.x, or 26+.
- CPU percentages may be `null` when measurement fails. Health adds `UNKNOWN` and `measurementStatus: "partial"`; a known warning or critical measurement still takes precedence over unknown data. Inspect alerts before making a diagnosis.
- GPU memory and process counts may be `null` when not measurable. Select a GPU using `gpuId` from `gpus`. NVIDIA fallback lists compute applications only; Windows process counters are used only when there is exactly one physical adapter. Process coverage is identified by `processSource` and `processStatus`.
- Windows software inventories return `isError: true` with `UNSUPPORTED_PLATFORM` on Linux/macOS, or `COLLECTION_FAILED` on query errors. Empty successful inventories remain valid.
- Full service enumeration (`get_services`) returns `UNSUPPORTED_PLATFORM` on macOS because the underlying library cannot list all macOS services. Use `search_process` to inspect a known process. macOS integration tests verify this error contract and remain enabled in CI.
- Every tool advertises an output schema and read-only annotations. Successful results expose matching JSON in `structuredContent` and text. Errors expose a structured code/message and do not pretend to be successful measurements.
- Network sampling covers all adapters except identified loopback adapters. Mbps uses decimal bits/second; legacy KBps fields represent KiB/s and are identified in `units`. `elapsedMs` includes collection overhead, while `samplingIntervalMs` is the requested wait.
- Disk `freeGB`/`availableGB` represent space available to the current user; `reservedGB` reports reserved free blocks. Used + available + reserved equals total, allowing for rounding.
- Concurrent health reads share a sample for 250 ms. Static hardware inventory is cached for 30 seconds. The temporal diagnostic always collects fresh system samples and labels unavailable I/O rather than assuming zero.

See [CHANGELOG.md](CHANGELOG.md) for release notes and [RELEASING.md](RELEASING.md) for publishing setup.

## License

This project is licensed under the [MIT License](LICENSE).
