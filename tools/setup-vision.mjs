import { mkdir, copyFile, readdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const folder = join(root, "public", "vision");
await mkdir(folder, { recursive: true });
const models = [
  {
    file: "face-detector.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    source: "https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector",
    expectedSha256: "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
  },
  {
    file: "modnet.onnx",
    url: "https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx",
    source: "https://huggingface.co/Xenova/modnet/tree/fa2fa546052fba4c08921230a26cc69a333fca12",
    license: "Apache-2.0",
    expectedSha256: "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9",
  },
];
const hashes = [];
for (const model of models) {
  const path = join(folder, model.file);
  let bytes;
  try { bytes = await readFile(path); }
  catch (cause) { if (cause.code !== "ENOENT") throw cause; }
  const existing = !!bytes;
  if (!existing) {
    console.log(`Downloading published model asset: ${model.file}`);
    const response = await fetch(model.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Download failed for ${model.file}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length < 100_000 || bytes.length > 100_000_000) throw new Error(`Unexpected model size: ${model.file}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== model.expectedSha256) throw new Error(`Checksum mismatch for ${model.file}. No model was installed. Do not bypass this check; review the publisher and pinned asset.`);
  if (!existing) {
    const temporary = `${path}.download`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  }
  console.log(`Verified SHA-256: ${model.file}`);
  hashes.push({ ...model, bytes: bytes.length, sha256 });
}
for (const directory of ["@mediapipe/tasks-vision/wasm", "onnxruntime-web/dist"]) {
  const source = join(root, "node_modules", directory);
  for (const name of await readdir(source)) {
    if (directory.includes("mediapipe") || name === "ort-wasm-simd-threaded.wasm" || name === "ort-wasm-simd-threaded.mjs") {
      await copyFile(join(source, name), join(folder, name));
    }
  }
}
await writeFile(join(folder, "model-provenance.json"), JSON.stringify({
  purpose: "Local browser inference only. Setup downloads public model files, never user photos.",
  models: hashes,
}, null, 2));
console.log("Local model and runtime assets installed. Runtime will not contact their publishers.");
