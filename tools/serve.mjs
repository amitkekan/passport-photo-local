import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const assets = new Map();
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await collect(join(directory, entry.name), `${prefix}/${entry.name}`);
    else if (entry.isFile()) assets.set(`${prefix}/${entry.name}`, join(directory, entry.name));
  }
}
await collect(root);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const policy = [
  "default-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "worker-src blob:",
  "img-src 'self' blob: data:", "font-src 'self'",
  "connect-src http://127.0.0.1:4317/vision/ http://localhost:4317/vision/",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join("; ");
const server = createServer(async (request, response) => {
  response.setHeader("Content-Security-Policy", policy);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (request.headers.host !== "127.0.0.1:4317" && request.headers.host !== "localhost:4317") {
    response.writeHead(403); response.end("Loopback host required."); request.resume(); return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    response.writeHead(405); response.end("This application has no upload or write endpoints."); request.resume(); return;
  }
  const path = request.url === "/" ? "/index.html" : request.url;
  const file = assets.get(path);
  if (!file) { response.writeHead(404); response.end("Not found."); return; }
  try {
    const body = await readFile(file);
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    response.setHeader("Content-Length", body.length);
    response.writeHead(200);
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    // Do not log request paths, headers or bodies; they may contain personal data.
    console.error("A static application asset could not be read.");
    response.writeHead(500); response.end("Could not read application asset.");
  }
});
server.on("error", error => {
  console.error(`Local server could not start (${error.code ?? "unknown error"}). Stop the existing instance or check local permissions.`);
  process.exitCode = 1;
});
server.listen(4317, "127.0.0.1", () => {
  console.log("Passport Photo Local: http://127.0.0.1:4317");
  console.log("Static files only. No upload endpoints or request logs. Press Ctrl+C to stop.");
});
