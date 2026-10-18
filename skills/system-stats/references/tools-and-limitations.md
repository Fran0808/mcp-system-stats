# Tool contracts and interpretation

Baseline: `@fran0808/system-stats` 2.0.1. Discover the connected server's schemas before calling a tool; identifiers may have a client prefix. All 18 tools are read-only. They report the machine running the server, including a remote host if that is where it was launched.

## Inputs and availability

| Tool | Inputs | Notes |
|---|---|---|
| `get_system_overview` | None | OS, CPU, uptime and identity; avoid including identity in ordinary reports |
| `get_system_health` | None | CPU/RAM threshold assessment, not a complete hardware health certification |
| `get_cpu_stats` | None | Load, clocks and available thermal sensors; sensor absence is not 0 degrees |
| `get_memory_status` | `unit`: `GB` or `MB` | Values use powers of 1024; memory accounting is based on `node:os` |
| `get_disk_space` | `path`: filesystem path | Defaults to `C:\` on Windows or `/`; pass the actual requested volume |
| `get_top_processes` | `sortBy`: `cpu`/`memory`; `limit`: 1..50; `groupByApp`: boolean | Defaults: CPU, 5, grouped; grouped PID arrays include at most five PIDs |
| `search_process` | `name`: string | Case-insensitive substring search; matching names do not prove application health |
| `get_network_info` | None | Interface addresses and MACs; does not perform an internet connectivity test |
| `get_network_speed` | None | Samples traffic over a requested one-second wait; elapsed collection may take longer |
| `get_gpu_stats` | None | Controllers, displays and available GPU telemetry |
| `get_gpu_processes` | `gpuId`: returned id/index; `limit`: 1..50 | Default selects the first adapter; discover `gpus` and select explicitly for multi-GPU questions |
| `get_battery_status` | None | No battery on a desktop is an expected result |
| `get_hardware_specs` | None | Physical hardware inventory, cached for 30 seconds |
| `get_usb_devices` | None | Connected USB inventory; enumerate only when relevant |
| `get_services` | `status`: `all`/`running`/`stopped`; `search`; `limit`: 1..100 | Windows/Linux; full enumeration is unsupported on macOS |
| `get_startup_programs` | `search`; `limit`: 1..50 | Windows only |
| `get_installed_programs` | `search`; `sortBy`: `name`/`installDate`/`size`; `order`: `asc`/`desc`; `limit`: 1..100 | Windows only |
| `get_performance_diagnostics` | `samples`: 2..5; `intervalMs`: 250..2000 | Defaults: 3, 1000; fresh CPU/RAM samples, disk I/O rates and volume capacity |

The current server also exposes `system://overview`, `system://health`, `system://hardware`, and `system://live-stats` as resources. Their availability in the client is optional; use the tools when resource attachment is unsupported.

## Reading results

Successful tools provide matching JSON text and `structuredContent`. Check `isError` first. Structured errors include `code`, `message`, and `measurementStatus`; `UNSUPPORTED_PLATFORM` and `COLLECTION_FAILED` are distinct. Not every successful tool includes timestamps or quality fields: inspect what was actually returned rather than requiring fields that its schema does not promise.

- CPU/RAM health uses 75% warning and 90% critical thresholds. A known critical value can coexist with `measurementStatus: partial` when another sensor failed. Preserve both facts.
- `summary.cpu` and `summary.memory` include average, peak, available sample count and `sustainedPressure`. A false sustained flag with missing samples does not prove normal operation. Describe only the short measured window, not a long-term trend.
- Disk `freeGB` / `availableGB` is space available to the current user. `reservedGB` accounts for free blocks reserved from that user; rounded used + available + reserved approximates total. Capacity and operations/second do not measure disk response time.
- Network `downloadKBps` / `uploadKBps` are KiB/s despite the legacy names. Mbps is decimal bits/second. Zero measured traffic is different from `measurementStatus: unavailable` or a failed call. Neither zero nor a quiet interface establishes an internet outage.
- GPU `measurementStatus` describes memory coverage; inspect `processStatus` separately. NVIDIA compute-app queries can omit graphics-only processes. Windows process counters are used only for a single physical adapter. A zero successful process count is different from an unavailable count.
- CPU temperature can be `N/A`. Windows optionally reads LibreHardwareMonitor sensors if already available; the skill should not require installing it. Temperature thresholds are generic labels rather than proof of hardware damage or throttling.

## Scope of conclusions

High RAM use based on OS free memory is a pressure signal, not proof of a leak or insufficient hardware; caches and OS accounting differ. Process rankings may have a different sampling basis from aggregate CPU measurements. Do not sum unrelated samples to claim exact attribution.

Report an observed condition separately from its suspected cause. Hardware inventory does not by itself establish RAM channel configuration, drive SMART health, upgrade compatibility, or workload fit. Missing evidence belongs in the report.
