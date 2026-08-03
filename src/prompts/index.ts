import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export function registerAllPrompts(server: McpServer) {
    server.registerPrompt(
        "diagnose-system",
        {
            description: "Run a full system diagnostic covering CPU, RAM, temperature, and heavy processes to generate a health report with actionable recommendations."
        },
        () => ({
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text: [
                            "Run a complete diagnostic of my system following these steps:",
                            "",
                            "1. Call get_system_health to check the overall status (HEALTHY / WARNING / CRITICAL).",
                            "2. Call get_cpu_stats to evaluate CPU load per core and temperature.",
                            "3. Call get_memory_status to check current RAM usage.",
                            "4. Call get_top_processes sorted by CPU to identify the heaviest applications.",
                            "",
                            "Then give me a clear diagnostic summary:",
                            "- Current health status with an explanation.",
                            "- Whether CPU or RAM are under pressure and why.",
                            "- Which applications are consuming the most resources.",
                            "- Concrete recommendations to improve performance if needed."
                        ].join("\n")
                    }
                }
            ]
        })
    );

    server.registerPrompt(
        "hardware-report",
        {
            description: "Compile a complete hardware inventory of the system including motherboard, CPU, GPU, RAM layout, storage drives, and connected USB peripherals."
        },
        () => ({
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text: [
                            "Generate a complete hardware report for my computer:",
                            "",
                            "1. Call get_system_overview to get OS and CPU model information.",
                            "2. Call get_hardware_specs to retrieve motherboard, BIOS, RAM sticks, and storage drives.",
                            "3. Call get_gpu_stats to get GPU model, VRAM, and connected displays.",
                            "4. Call get_usb_devices to list all connected USB peripherals.",
                            "",
                            "Present the results as a structured hardware inventory sheet, organized by component category.",
                            "Include any notable observations (e.g., mismatched RAM sticks, single-channel vs dual-channel, SMART drive warnings)."
                        ].join("\n")
                    }
                }
            ]
        })
    );

    server.registerPrompt(
        "network-check",
        {
            description: "Analyze all network interfaces, measure current bandwidth usage, and identify the most active connection."
        },
        () => ({
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text: [
                            "Perform a network connectivity and speed check:",
                            "",
                            "1. Call get_network_info to list all network interfaces with their IP and MAC addresses.",
                            "2. Call get_network_speed to measure real-time download and upload bandwidth per interface.",
                            "",
                            "Then provide:",
                            "- A summary of all active interfaces (Wi-Fi, Ethernet, etc.).",
                            "- Current download/upload speeds on each interface.",
                            "- Which interface is handling the most traffic.",
                            "- Any issues detected (e.g., no active interfaces, zero bandwidth)."
                        ].join("\n")
                    }
                }
            ]
        })
    );

    server.registerPrompt(
        "performance-bottleneck",
        {
            description: "Detect the main performance bottleneck by analyzing CPU, RAM, and disk usage to determine what is limiting the system.",
            argsSchema: z.object({
                focus: z.enum(["cpu", "memory", "disk", "all"]).default("all")
                    .describe("Area to focus the analysis on: cpu, memory, disk, or all.")
            })
        },
        ({ focus }) => {
            const steps: string[] = [];

            if (focus === "all" || focus === "cpu") {
                steps.push("- Call get_cpu_stats to analyze CPU load, per-core usage, and temperature.");
            }
            if (focus === "all" || focus === "memory") {
                steps.push("- Call get_memory_status to check RAM usage and available memory.");
                steps.push("- Call get_top_processes sorted by memory to find memory-heavy applications.");
            }
            if (focus === "all" || focus === "disk") {
                steps.push("- Call get_disk_space to check available storage on each drive.");
            }
            if (focus === "all") {
                steps.push("- Call get_top_processes sorted by CPU to find CPU-heavy applications.");
            }

            return {
                messages: [
                    {
                        role: "user" as const,
                        content: {
                            type: "text" as const,
                            text: [
                                `Detect performance bottlenecks on my system (focus: ${focus}).`,
                                "",
                                "Execute the following:",
                                ...steps,
                                "",
                                "Then determine:",
                                "- What is the main bottleneck right now (CPU, RAM, or disk)?",
                                "- What is causing it (specific processes or system conditions)?",
                                "- What concrete actions can I take to resolve it?"
                            ].join("\n")
                        }
                    }
                ]
            };
        }
    );
}
