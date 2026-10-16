import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web/wasm";
import { estimatedHead, type Face } from "./core";
import { context, makeCanvas, thumbnail } from "./images";
import type { Eyes } from "./eyes";

export type PortraitMatte = { alpha: Float32Array; width: number; height: number };
let detector: FaceDetector | undefined;
let matting: ort.InferenceSession | undefined;
let initialization: Promise<void> | undefined;

export function initializeVision(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = `${location.origin}/vision/`;
    const [files, faceModel, matteModel] = await Promise.all([
      FilesetResolver.forVisionTasks("/vision"),
      fetch("/vision/face-detector.tflite", { cache: "no-store", credentials: "omit" }),
      fetch("/vision/modnet.onnx", { cache: "no-store", credentials: "omit" }),
    ]);
    if (!faceModel.ok || !matteModel.ok) {
      throw new Error("Local model files are missing. Run npm run setup:vision and rebuild the app.");
    }
    detector = await FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: new Uint8Array(await faceModel.arrayBuffer()), delegate: "CPU" },
      runningMode: "IMAGE", minDetectionConfidence: 0.65, minSuppressionThreshold: 0.3,
    });
    matting = await ort.InferenceSession.create(await matteModel.arrayBuffer(), {
      executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3,
    });
  })().catch(async error => {
    detector?.close(); detector = undefined;
    if (matting) await matting.release();
    matting = undefined; initialization = undefined;
    throw error;
  });
  return initialization;
}

export function detectFaces(canvas: HTMLCanvasElement): Face[] {
  if (!detector) throw new Error("Local face detection is not ready.");
  const sample = thumbnail(canvas, 1280);
  const sx = canvas.width / sample.width, sy = canvas.height / sample.height;
  return detector.detect(sample).detections.flatMap(result => {
    const box = result.boundingBox;
    if (!box) return [];
    const x = Math.max(0, box.originX * sx), y = Math.max(0, box.originY * sy);
    const bounds = {
      x, y, width: Math.min(box.width * sx, canvas.width - x),
      height: Math.min(box.height * sy, canvas.height - y),
    };
    if (bounds.width <= 0 || bounds.height <= 0) return [];
    const points = result.keypoints.slice(0, 2).map(point => ({ x: point.x * canvas.width, y: point.y * canvas.height })).sort((a, b) => a.x - b.x);
    const eyes: Eyes | undefined = points.length === 2 && points[1].x > points[0].x &&
      points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height)
      ? { left: points[0], right: points[1], source: "detected" } : undefined;
    return [{ bounds, head: estimatedHead(bounds, canvas.width, canvas.height), eyes,
      confidence: result.categories[0]?.score ?? 0, source: "detected" as const }];
  }).sort((a, b) => a.bounds.x - b.bounds.x);
}

export async function portraitMatte(canvas: HTMLCanvasElement): Promise<PortraitMatte> {
  if (!matting) throw new Error("Local portrait matting is not ready.");
  // Match MODNet's RGB normalization and dimensions divisible by 32, with a memory bound.
  const scale = Math.min(512 / Math.min(canvas.width, canvas.height), 1024 / Math.max(canvas.width, canvas.height));
  const width = Math.max(32, Math.floor(canvas.width * scale / 32) * 32);
  const height = Math.max(32, Math.floor(canvas.height * scale / 32) * 32);
  const input = makeCanvas(width, height);
  context(input).drawImage(canvas, 0, 0, width, height);
  const pixels = context(input).getImageData(0, 0, width, height).data;
  const plane = width * height;
  const values = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let channel = 0; channel < 3; channel++) values[channel * plane + i] = pixels[i * 4 + channel] / 127.5 - 1;
  }
  const tensor = new ort.Tensor("float32", values, [1, 3, height, width]);
  let result: ort.InferenceSession.OnnxValueMapType | undefined;
  try {
    result = await matting.run({ [matting.inputNames[0]]: tensor });
    const output = result[matting.outputNames[0]];
    if (!(output.data instanceof Float32Array) || output.dims.length !== 4 ||
      output.dims[2] !== height || output.dims[3] !== width || output.data.length !== plane) {
      throw new Error("The local model returned an unexpected portrait mask.");
    }
    const alpha = output.data.slice();
    if (!alpha.every(Number.isFinite)) throw new Error("The portrait mask contains invalid pixels.");
    const solid = alpha.reduce((sum, value) => sum + (value > 0.8 ? 1 : 0), 0) / plane;
    if (solid < 0.005 || solid > 0.98) {
      throw new Error("A reliable person/background separation was not found. Use the original or retake with a clearer view of the person.");
    }
    return { alpha, width, height };
  } finally {
    tensor.dispose();
    if (result) for (const output of Object.values(result)) output.dispose();
  }
}
