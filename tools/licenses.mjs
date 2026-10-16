import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const packages = [];
const notices = [];
const permitted = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "CC-BY-4.0"]);
const flagged = [];
const upstreamNotices = {
  "heic-to@1.6.5": ["libheif-1.23.5.txt", "libde265-1.0.16.txt"],
  "@mediapipe/tasks-vision@0.10.21": ["mediapipe-0.10.21.txt"],
  "onnxruntime-common@1.22.0": ["onnxruntime-1.22.0.txt", "onnxruntime-third-party-1.22.0.txt"],
  "onnxruntime-web@1.22.0": ["onnxruntime-1.22.0.txt", "onnxruntime-third-party-1.22.0.txt"],
};
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const folder = join(directory, entry.name);
    if (entry.name.startsWith("@")) { await scan(folder); continue; }
    const manifest = JSON.parse(await readFile(join(folder, "package.json"), "utf8"));
    const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type ?? "UNKNOWN";
    const files = await readdir(folder);
    const licenseFiles = files.filter(name => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name));
    const texts = [];
    for (const name of licenseFiles) {
      const item = (await readdir(folder, { withFileTypes: true })).find(file => file.name === name);
      if (item?.isFile()) texts.push({ file: name, text: await readFile(join(folder, name), "utf8") });
    }
    const pkg = { name: manifest.name, version: manifest.version, license, repository: manifest.repository ?? null };
    packages.push(pkg); notices.push({ ...pkg, licenseTexts: texts });
    if (files.includes("node_modules")) await scan(join(folder, "node_modules"));
  }
}
await scan(join(root, "node_modules"));
for (const item of notices) {
  for (const file of upstreamNotices[`${item.name}@${item.version}`] ?? []) {
    item.licenseTexts.push({ file: `third-party-licenses/${file}`, text: await readFile(join(root, "third-party-licenses", file), "utf8") });
  }
  if (item.licenseTexts.length === 0) {
    const parentName = item.name.startsWith("@esbuild/") ? "esbuild" :
      item.name.startsWith("@rollup/rollup-") ? "rollup" : undefined;
    const parent = notices.find(candidate => candidate.name === parentName &&
      candidate.version === item.version && candidate.license === item.license &&
      candidate.repository?.url && candidate.repository.url === item.repository?.url);
    if (parent) {
      item.licenseTexts = parent.licenseTexts.map(text => ({
        ...text, file: `${parent.name}@${parent.version}/${text.file} (same-release native binary notice)`,
      }));
    }
  }
  if (!permitted.has(item.license) || item.licenseTexts.length === 0) {
    flagged.push(`${item.name}@${item.version}: ${item.license}${item.licenseTexts.length === 0 ? " (no verified license text)" : ""}`);
  }
}
packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
notices.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
await mkdir(join(root, "public"), { recursive: true });
await writeFile(join(root, "public", "third-party-notices.json"), JSON.stringify({
  scope: "Installed application and development dependencies. Original project code is Apache-2.0. Local model provenance is documented separately in vision/model-provenance.json.",
  packages: notices,
}, null, 2));
await writeFile(join(root, "dependency-inventory.json"), JSON.stringify({ packages, manualReviewRequired: flagged }, null, 2));
console.log(`Inventoried ${packages.length} installed packages; preserved ${notices.reduce((sum, item) => sum + item.licenseTexts.length, 0)} notice/license files.`);
if (flagged.length) {
  console.error(`Manual review required:\n${flagged.join("\n")}`);
  process.exitCode = 1;
} else console.log("All installed package declarations match the reviewed license list and include root license text. This is not a legal audit.");
