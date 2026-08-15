import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export function registerSoftwareTools(server: McpServer) {
    server.registerTool(
        "get_startup_programs",
        {
            description: "Inspect all programs, background updaters, and helper agents configured to execute automatically when the operating system starts (equivalent to Task Manager's 'Startup' tab). Returns program name, full command-line execution string with parameters, registration location (Registry User Run, Registry System Run, or Startup Folder), and user scope. Use to audit boot impact, identify unnecessary startup bloatware, and optimize system startup times.",
            inputSchema: z.object({
                search: z.string().optional().describe("Case-insensitive keyword to filter startup programs by application name or command path (e.g. 'discord', 'steam', 'updater')."),
                limit: z.number().min(1).max(50).optional().default(25).describe("Maximum number of startup items to return (1 to 50, default: 25).")
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

    server.registerTool(
        "get_installed_programs",
        {
            description: "Query the comprehensive installed software application catalog from the system registry (equivalent to Windows Settings 'Installed Apps' / Programs & Features). Returns software name, installed version string, publisher/vendor organization, formatted installation date (YYYY-MM-DD), and installation folder path. Supports keyword searching across program names and publishers, and sorting alphabetically or by installation date. Use to audit software inventory, verify installed package versions, or check recently installed applications.",
            inputSchema: z.object({
                search: z.string().optional().describe("Case-insensitive keyword to search installed software by application name or publisher (e.g. 'python', 'microsoft', 'adobe', 'docker')."),
                sortBy: z.enum(["name", "installDate"]).optional().default("name").describe("Sort order for the returned software catalog: 'name' for alphabetical by app name (default) or 'installDate' for most recently installed first."),
                limit: z.number().min(1).max(100).optional().default(50).describe("Maximum number of installed programs to return (1 to 100, default: 50).")
            })
        },
        async ({ search, sortBy, limit }) => {
            try {
                let appList: Array<{
                    name: string;
                    version: string;
                    publisher: string;
                    installDate: string;
                    installLocation: string;
                }> = [];

                if (process.platform === "win32") {
                    try {
                        const { stdout } = await execAsync(
                            `powershell -NoProfile -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue | Where-Object DisplayName | Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation | ConvertTo-Json -Compress"`
                        );

                        if (stdout.trim()) {
                            const items = JSON.parse(stdout.trim());
                            const arrayItems = Array.isArray(items) ? items : [items];
                            const seen = new Set<string>();

                            for (const item of arrayItems) {
                                if (!item || !item.DisplayName) continue;
                                const name = String(item.DisplayName).trim();
                                if (!name || seen.has(name.toLowerCase())) continue;
                                seen.add(name.toLowerCase());

                                let formattedDate = "N/A";
                                if (item.InstallDate) {
                                    const dateStr = String(item.InstallDate).trim();
                                    if (/^\d{8}$/.test(dateStr)) {
                                        formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
                                    } else {
                                        formattedDate = dateStr;
                                    }
                                }

                                appList.push({
                                    name,
                                    version: item.DisplayVersion ? String(item.DisplayVersion).trim() : "N/A",
                                    publisher: item.Publisher ? String(item.Publisher).trim() : "Unknown",
                                    installDate: formattedDate,
                                    installLocation: item.InstallLocation ? String(item.InstallLocation).trim() : "N/A"
                                });
                            }
                        }
                    } catch {
                        // ignore PowerShell error
                    }
                }

                // Apply search filter
                let filtered = appList;
                if (search && search.trim()) {
                    const query = search.toLowerCase().trim();
                    filtered = filtered.filter(
                        (a) => a.name.toLowerCase().includes(query) || a.publisher.toLowerCase().includes(query)
                    );
                }

                // Sort
                filtered.sort((a, b) => {
                    if (sortBy === "installDate") {
                        if (a.installDate === "N/A") return 1;
                        if (b.installDate === "N/A") return -1;
                        return b.installDate.localeCompare(a.installDate);
                    }
                    return a.name.localeCompare(b.name);
                });

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    totalInstalledPrograms: appList.length,
                                    filterApplied: { search: search || null, sortBy },
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
                            text: `Error retrieving installed programs: ${err.message}`
                        }
                    ]
                };
            }
        }
    );
}
