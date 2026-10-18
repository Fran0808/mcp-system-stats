---
name: system-stats
description: Diagnose local computer slowdowns, CPU and RAM pressure, disk capacity, GPU memory, and network activity using the mcp-system-stats MCP server. Use for live system diagnostics or hardware reports, not application code profiling or remote infrastructure monitoring.
---

# System Stats

Use the connected mcp-system-stats tools to answer the user's hardware or performance question with measurements. This skill complements the MCP server; it does not collect telemetry itself.

## Connection and scope

Discover the available MCP tools and their current input schemas. Names below are logical tool names; clients may prefix them. Confirm which machine hosts the server: its readings describe that host, which may differ from the user's computer in a remote session.

If the tools are unavailable, explain that the local MCP connection is required and use [setup instructions](references/setup.md) when the user requests connection help. Loading this skill through Agensi does not connect the system-stats server. A cloud-only assistant without access to local stdio tools cannot inspect the user's hardware.

Running `@fran0808/system-stats` starts an MCP stdio server, not a CLI that prints a diagnostic report. Do not invent readings or silently install software or alter the client's MCP configuration. If a delivery service has not exposed a linked supporting file, say what is missing; do not claim to have read a local path that is unavailable.

## Choose measurements

Match the work to the question; do not run a complete inventory for a narrow request.

| Request | Measurements |
|---|---|
| General slowdown | `get_system_health`, then `get_performance_diagnostics` with `samples: 3, intervalMs: 1000`; follow up on the affected resource |
| CPU load or heat | `get_cpu_stats`; `get_top_processes` with `sortBy: cpu, limit: 5, groupByApp: true`; temporal diagnostics when persistence matters |
| RAM consumption | `get_memory_status` with `unit: GB`; `get_top_processes` with `sortBy: memory, limit: 5, groupByApp: true` |
| Disk capacity | `get_disk_space` for the requested path; temporal diagnostics can enumerate mounted volumes |
| GPU / local model headroom | `get_gpu_stats`, then `get_gpu_processes`; select the requested GPU using an id or index returned in `gpus` |
| Network activity | `get_network_speed`; use `get_network_info` when interface identity is relevant |
| Specific app | `search_process` with the requested name; individual PIDs only when useful |
| Hardware report | `get_hardware_specs`, plus CPU/GPU information as needed; USB inventory only when relevant |
| Startup or software inventory | `get_startup_programs` or `get_installed_programs`, filtered to the request; Windows only |
| Background service | `get_services` on Windows/Linux; on macOS use `search_process` for a known process and state the narrower scope |

For a slowdown, collect the process ranking while the symptom is present. Distinguish the short sampling window from a long-term trend. A few samples cannot establish a memory leak. Extend sampling only when it resolves an uncertainty relevant to the user.

## Interpret evidence

- Prefer `structuredContent`. Check `isError`, error code, `measurementStatus`, timestamps, sensor source, and GPU `processStatus` / `processSource` before making a claim.
- `null`, `N/A`, unavailable, unsupported, and failed collection are missing evidence, not measured zero or healthy conditions. An empty successful inventory is different from a collection failure. Do not retry an unsupported operation; retry a transient failure at most once when useful.
- `get_system_health` evaluates CPU/RAM pressure. Its `HEALTHY` result does not certify disks, thermals, GPU, or network health.
- Server CPU/RAM thresholds (75% warning, 90% critical) and temperature labels are heuristics. State actual values and workload context; temperature limits vary by processor. Do not infer thermal throttling from temperature alone.
- A top process is a candidate contributor, not proof of causation. Rankings, grouped counts, and listed PID arrays may be truncated. Do not claim the PID list is exhaustive.
- Disk capacity and I/O operation rates do not prove latency, saturation, disk failure, or a performance bottleneck. State what further evidence is missing. Use the actual requested drive rather than assuming the default covers all storage.
- Network speed is observed traffic during the sample, not an internet speed test or maximum link capacity. Zero traffic can be normal idle activity and does not establish an outage. Respect returned units: Mbps uses decimal bits; legacy KBps fields represent KiB/s.
- NVIDIA process fallback covers compute applications and may exclude graphics processes. Missing GPU process telemetry does not mean no GPU activity. Do not merge memory across adapters or promise that a workload fits based only on nominal VRAM; include free memory and runtime overhead when known.
- Hardware inventories alone do not establish memory channel configuration, upgrade compatibility, or SMART health. Report those only when directly supported by measurements or authoritative specifications.

## Report

Reply in the user's language. Lead with the finding, then give the few measurements that support it, the sampling window and any material limitation. Separate observed facts from likely explanations. If no cause is established, say so and identify the next useful measurement.

For a full diagnostic, use these sections as appropriate: **Finding**, **Evidence**, **Limits**, and **Next steps**. Keep a narrow answer short. [Example reports](examples/diagnostic-report.md) illustrate missing sensors and an isolated CPU spike; their numbers are fictional and must never replace live data. Read [tool contracts and limitations](references/tools-and-limitations.md) when platform support, input ranges, units, or telemetry coverage are relevant.

Give concrete next steps proportional to the evidence. This diagnostic skill reads data; a request to inspect the system does not authorize terminating processes, disabling services or startup items, uninstalling programs, or changing settings.

Include only identity details needed for the question. Hostname, username, IP/MAC addresses, serial numbers, and complete software lists usually do not belong in a general performance summary.

Implementation baseline: mcp-system-stats 2.0.1, commit `7a5f661102254bae3d23d7ebe49dc788cedaaa52`. Discover the connected server's current schemas rather than assuming this baseline never changes.
