import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export function registerSoftwareTools(server: McpServer) {
    server.registerTool(
        "get_startup_programs",
        {
            description: "Use this tool whenever the user asks about startup applications, programs that launch on boot, auto-start software, or wants to check the Task Manager Startup tab.",
            inputSchema: z.object({
                search: z.string().optional(),
                limit: z.number().min(1).max(50).optional().default(25)
            })
        },
        async ({ search, limit }) => {
            try {
                let startupItems: Array<{
                    name: string;
                    command: string;
                    location: string;
                    user: string;
                }> = [];

                if (process.platform === "win32") {
                    try {
                        const { stdout } = await execAsync(
                            `powershell -NoProfile -Command "Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location, User | ConvertTo-Json -Compress"`
                        );

                        if (stdout.trim()) {
                            const items = JSON.parse(stdout.trim());
                            const arrayItems = Array.isArray(items) ? items : [items];

                            for (const item of arrayItems) {
                                if (!item || !item.Name) continue;

                                let friendlyLocation = item.Location || "Unknown";
                                if (item.Location?.includes("Run")) {
                                    if (item.Location.includes("HKU") || item.Location.includes("HKCU")) {
                                        friendlyLocation = "Registry (User Startup)";
                                    } else if (item.Location.includes("HKLM")) {
                                        friendlyLocation = "Registry (System Startup)";
                                    }
                                } else if (item.Location === "Startup") {
                                    friendlyLocation = "Startup Folder";
                                }

                                startupItems.push({
                                    name: item.Name,
                                    command: item.Command || "N/A",
                                    location: friendlyLocation,
                                    user: item.User || "N/A"
                                });
                            }
                        }
                    } catch {
                        // ignore PowerShell error
                    }
                }

                // Apply search filter
                let filtered = startupItems;
                if (search && search.trim()) {
                    const query = search.toLowerCase().trim();
                    filtered = filtered.filter(
                        (item) => item.name.toLowerCase().includes(query) || item.command.toLowerCase().includes(query)
                    );
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    totalStartupPrograms: startupItems.length,
                                    filterApplied: { search: search || null },
                                    returnedCount: Math.min(filtered.length, limit),
                                    programs: filtered.slice(0, limit)
                                },
                                null,
                                2
                            )
                        }
                    ]
                };
            } catch (err: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Error retrieving startup programs: ${err.message}`
                        }
                    ]
                };
            }
        }
    );
}
