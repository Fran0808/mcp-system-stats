import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
if (pkg.version !== lock.version || pkg.version !== lock.packages[""].version) throw new Error("Package and lockfile versions differ");
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : process.argv[2];
if (tag && tag !== `v${pkg.version}`) throw new Error(`Tag ${tag} must match v${pkg.version}`);
const { packageVersion } = await import(new URL("../build/version.js", import.meta.url));
if (packageVersion !== pkg.version) throw new Error("Runtime and package versions differ");
console.log(`Release ${pkg.version} verified${tag ? ` against ${tag}` : ""} in ${root}`);
