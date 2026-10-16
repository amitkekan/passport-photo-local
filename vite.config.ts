import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    "heic-decoder": fileURLToPath(new URL("./node_modules/heic-to/src/lib/libheif-without-unsafe-eval.js", import.meta.url)),
  } },
  server: { host: "127.0.0.1", port: 4317, strictPort: true },
  preview: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  },
});
