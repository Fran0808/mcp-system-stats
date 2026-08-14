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
- **CPU Stats and Temperature:** Comprehensive CPU load per core, frequency specifications, and thermal readings with native non-admin fallback for Windows.
- **Task-Manager-Style Process Aggregation:** Group top processes by application name (e.g. `brave.exe`, `code.exe`) with total memory, CPU utilization, and instance counts matching Windows Task Manager.
- **Live Network Bandwidth:** Sample real-time download and upload speeds (KB/s and Mbps) per active interface.
- **GPU and Displays:** Detect graphics cards, VRAM utilization, GPU temperatures, and connected monitors with resolution/refresh rates.
- **Robust Diagnostics:** Overall system health check with automated alerts for high CPU or RAM pressure.
- **Enterprise Ready:** 100% TypeScript, fully tested with Vitest and automated GitHub Actions CI.

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
| `get_system_health` | Comprehensive health check status (`HEALTHY`, `WARNING`, `CRITICAL`). | None |
| `get_hardware_specs` | Detailed physical hardware specs (Motherboard, BIOS, RAM sticks layout, physical SSD/HDD models). | None |
| `get_usb_devices` | All connected USB peripherals categorized by type (keyboard, mouse, webcam, storage, audio, hub). | None |
| `get_gpu_processes` | Per-process VRAM utilization, active GPU applications, and remaining VRAM margin (headroom). | `limit`: `1..50` |
| `get_services` | Background system services, execution status (`Running`/`Stopped`), and start mode (`Auto`/`Manual`/`Disabled`). | `status`: `"all"` \| `"running"` \| `"stopped"`, `search`: string, `limit`: `1..100` |
| `get_startup_programs` | Programs configured to launch on system startup (Task Manager Startup tab, Registry Run, Startup Folder). | `search`: string, `limit`: `1..50` |
| `get_installed_programs` | Installed software applications catalog with version, publisher, install date, and install directory. | `search`: string, `sortBy`: `"name"` \| `"installDate"`, `limit`: `1..100` |

---

## Available MCP Resources

MCP Resources allow LLM clients (Cursor, Claude Desktop, Windsurf, VS Code Copilot) to directly read or attach live system metrics as context (`system://...`).

| Resource URI | Resource Name | MIME Type | Description |
|---|---|---|---|
| `system://overview` | `system-overview` | `application/json` | Real-time summary of OS platform, CPU model, core counts, RAM, uptime, and identity. |
| `system://health` | `system-health` | `application/json` | Real-time diagnostic health check status (`HEALTHY`, `WARNING`, `CRITICAL`) and alerts. |
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
    "mainC": "27.9°C",
    "maxC": "27.9°C",
    "status": "NORMAL",
    "sensorSource": "Windows Thermal Zone Performance Counter",
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
npm install
```

### Build
Compile TypeScript to JavaScript (`build/`):
```bash
npm run build
```

### Run Tests
Execute the Vitest suite:
```bash
npm test
```

---

## License

This project is licensed under the [MIT License](LICENSE).
