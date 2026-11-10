import {
  adjustedAlpha, analyzePixels, dimensionsAllowed, MAX_FILE_BYTES, PORTAL_LIMIT, PORTAL_TARGET,
  readHeader, setJpegDensity, sheetLayout, SHEET_PRESETS, sufficientResolution, printDimensions, PRINT_FORMATS,
  type MatteSettings, type Ppi, type Quality, type Rect, type SheetPreset, type PrintFormat,
} from "./core";
import type { PortraitMatte } from "./vision";
import { applyTonePixels, editSuffix, hasTone, type ImageEdits, type ToneSettings } from "./tone";
import { assessBackgroundPixels, BACKGROUND_COLORS, compositeEdgePixels, estimateColorField, type BackgroundColor } from "./background";
import { decodeHeic } from "./heic";
import { fromStraightened, straightenBounds, straightenWeight, type Straightening } from "./pose";

export type Photo = { canvas: HTMLCanvasElement; preview: string; name: string; format: "jpeg" | "png" | "heic" };
export type Output = { name: string; blob: Blob; width: number; height: number; printSize?: string };

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
}

export function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
  if (!value) throw new Error("Your browser could not create an image canvas. Try a current Edge or Chrome browser.");
  return value;
}

export function thumbnail(canvas: HTMLCanvasElement, maxSize = 1000): HTMLCanvasElement {
  const factor = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const output = makeCanvas(Math.max(1, Math.round(canvas.width * factor)), Math.max(1, Math.round(canvas.height * factor)));
  context(output).drawImage(canvas, 0, 0, output.width, output.height);
  return output;
}

export async function loadPhoto(file: File): Promise<Photo> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Choose an image smaller than 25 MiB.");
  if (file.size === 0) throw new Error("This file is empty.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const header = readHeader(bytes);
  if (!dimensionsAllowed(header.width, header.height)) {
    throw new Error("This image exceeds the local safety limit: 24 megapixels and 10,000 pixels on either side.");
  }
  const image = header.format === "heic" ? await decodeHeic(buffer) :
    await createImageBitmap(file, { imageOrientation: "from-image", colorSpaceConversion: "default" });
  try {
    if (!dimensionsAllowed(image.width, image.height)) throw new Error("Decoded dimensions exceed the safety limits.");
    const canvas = makeCanvas(image.width, image.height);
    const ctx = context(canvas);
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height);
    for (let i = 3; i < pixels.data.length; i += 4) {
      if (pixels.data[i] !== 255) throw new Error("Transparent images are not accepted. Upload the original opaque photograph, not a cutout.");
    }
    return { canvas, preview: thumbnail(canvas).toDataURL("image/jpeg", 0.9), name: file.name, format: header.format };
  } finally {
    image.close();
  }
}

export type StraightenResult = { canvas: HTMLCanvasElement; edgeFilledPixels: number; maxEdgeExtension: number };
// Mean per-channel difference allowed between an edge pixel and the plain background just inside it.
const EDGE_FILL_TOLERANCE = 6;

/**
 * Head-only rotation with a smooth fade; pixels outside the fade zone are copied unchanged and the size is kept.
 * Where the fade zone reaches past the photo edge, the nearest edge pixel is extended only if that edge is plain.
 */
export function straightenCanvas(original: HTMLCanvasElement, g: Straightening): StraightenResult {
  if (g.width !== original.width || g.height !== original.height) throw new Error("Straightening does not match this photo.");
  const canvas = makeCanvas(g.width, g.height);
  const ctx = context(canvas);
  ctx.drawImage(original, 0, 0);
  const area = straightenBounds(g);
  if (area.width === 0 || area.height === 0) return { canvas, edgeFilledPixels: 0, maxEdgeExtension: 0 };
  // Every sample lies within the farthest rotated corner of the fade area.
  const reach = Math.ceil(Math.max(...[[area.x, area.y], [area.x + area.width, area.y], [area.x, area.y + area.height], [area.x + area.width, area.y + area.height]]
    .map(([x, y]) => Math.hypot(x - g.pivot.x, y - g.pivot.y))) * Math.abs(g.degrees) * Math.PI / 180) + 2;
  const sx0 = Math.max(0, area.x - reach), sy0 = Math.max(0, area.y - reach);
  const sw = Math.min(g.width, area.x + area.width + reach) - sx0, sh = Math.min(g.height, area.y + area.height + reach) - sy0;
  const src = ctx.getImageData(sx0, sy0, sw, sh).data;
  const out = ctx.getImageData(area.x, area.y, area.width, area.height);
  const data = out.data;
  const pixel = [0, 0, 0, 0], inner = [0, 0, 0, 0];
  const sample = (x: number, y: number, target: number[]) => {
    const fx = Math.max(0, Math.min(sw - 1, x - 0.5 - sx0)), fy = Math.max(0, Math.min(sh - 1, y - 0.5 - sy0));
    const ix = Math.min(sw - 2, Math.floor(fx)), iy = Math.min(sh - 2, Math.floor(fy)), tx = fx - ix, ty = fy - iy;
    const i00 = (iy * sw + ix) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
    for (let c = 0; c < 4; c++) target[c] = (src[i00 + c] * (1 - tx) + src[i10 + c] * tx) * (1 - ty) + (src[i01 + c] * (1 - tx) + src[i11 + c] * tx) * ty;
  };
  let filled = 0, maxExtension = 0, edgeDifference = 0;
  for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
    const q = { x: area.x + x + 0.5, y: area.y + y + 0.5 };
    if (straightenWeight(q, g) === 0) continue;
    const s = fromStraightened(q, g);
    const cx = Math.max(0.5, Math.min(g.width - 0.5, s.x)), cy = Math.max(0.5, Math.min(g.height - 0.5, s.y));
    sample(cx, cy, pixel);
    if (cx !== s.x || cy !== s.y) {
      const extension = Math.hypot(s.x - cx, s.y - cy);
      // Compare the edge with the background the same distance inside it, mirrored across the edge.
      sample(2 * cx - s.x, 2 * cy - s.y, inner);
      edgeDifference += (Math.abs(pixel[0] - inner[0]) + Math.abs(pixel[1] - inner[1]) + Math.abs(pixel[2] - inner[2])) / 3;
      filled++; maxExtension = Math.max(maxExtension, extension);
    }
    const o = (y * area.width + x) * 4;
    for (let c = 0; c < 4; c++) data[o + c] = pixel[c];
  }
  if (filled > 0 && edgeDifference / filled > EDGE_FILL_TOLERANCE) {
    throw new Error("The head is close to a photo edge that is not plain background, so straightening would need invented pixels. Use a photo with more plain space around the head.");
  }
  ctx.putImageData(out, area.x, area.y);
  return { canvas, edgeFilledPixels: filled, maxEdgeExtension: maxExtension };
}

export function analyzePhoto(canvas: HTMLCanvasElement): Quality {
  const sample = thumbnail(canvas, 480);
  const pixels = context(sample).getImageData(0, 0, sample.width, sample.height);
  return analyzePixels(pixels.data, sample.width, sample.height);
}

export function assessBackground(canvas: HTMLCanvasElement, matte: PortraitMatte) {
  const sample = makeCanvas(matte.width, matte.height);
  context(sample).drawImage(canvas, 0, 0, sample.width, sample.height);
  return assessBackgroundPixels(context(sample).getImageData(0, 0, sample.width, sample.height).data, matte.alpha, matte.width, matte.height);
}

export function compositeBackground(canvas: HTMLCanvasElement, matte: PortraitMatte, settings: MatteSettings, color: BackgroundColor): HTMLCanvasElement {
  const alpha = Float32Array.from(matte.alpha, value => adjustedAlpha(value, settings));
  // Local wall and person colors are estimated from the same (possibly lighting-adjusted) pixels being composited.
  const small = makeCanvas(matte.width, matte.height);
  const smallContext = context(small);
  smallContext.imageSmoothingEnabled = true; smallContext.imageSmoothingQuality = "high";
  smallContext.drawImage(canvas, 0, 0, small.width, small.height);
  const field = estimateColorField(smallContext.getImageData(0, 0, small.width, small.height).data, matte.alpha, matte.width, matte.height);
  const output = makeCanvas(canvas.width, canvas.height);
  const ctx = context(output);
  ctx.drawImage(canvas, 0, 0);
  const pixels = ctx.getImageData(0, 0, output.width, output.height);
  compositeEdgePixels(pixels.data, output.width, output.height, alpha, field, BACKGROUND_COLORS[color].rgb);
  ctx.putImageData(pixels, 0, 0);
  return output;
}

export function renderAdjustments(original: HTMLCanvasElement, tone: ToneSettings, matte: PortraitMatte | null,
  matteSettings: MatteSettings, color: BackgroundColor = "white"): HTMLCanvasElement {
  let canvas = original;
  if (hasTone(tone)) {
    const output = makeCanvas(canvas.width, canvas.height);
    const pixels = context(canvas).getImageData(0, 0, canvas.width, canvas.height);
    pixels.data.set(applyTonePixels(pixels.data, tone));
    context(output).putImageData(pixels, 0, 0);
    canvas = output;
  }
  // Composite after tonal adjustments so the selected background color stays unchanged.
  return matte ? compositeBackground(canvas, matte, matteSettings, color) : canvas;
}

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob?.type === "image/jpeg" ? resolve(blob) : reject(new Error("The browser failed to encode a JPEG.")),
    "image/jpeg", quality,
  ));
}

async function verifyJpeg(blob: Blob, width: number, height: number): Promise<void> {
  const image = await createImageBitmap(blob);
  try {
    if (image.width !== width || image.height !== height) throw new Error("Export dimensions did not match the requested dimensions.");
  } finally { image.close(); }
}

function renderCrop(source: HTMLCanvasElement, rect: Rect, width: number, height: number): HTMLCanvasElement {
  if (!sufficientResolution(rect, width, height)) {
    throw new Error(`The crop needs at least ${width} x ${height} real source pixels. Reduce zoom, choose 300 PPI for prints, or upload a higher-resolution original.`);
  }
  const canvas = makeCanvas(width, height);
  const ctx = context(canvas);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
  return canvas;
}

export async function createOutputs(
  source: HTMLCanvasElement, printRect: Rect, portalRect: Rect, ppi: Ppi,
  includePortal: boolean, preset: SheetPreset, showCutGuides: boolean, edits: ImageEdits, format: PrintFormat,
): Promise<Output[]> {
  const suffix = editSuffix(edits);
  const pixels = printDimensions(format, ppi), photoSpec = PRINT_FORMATS[format];
  const print = renderCrop(source, printRect, pixels.width, pixels.height);
  const layout = sheetLayout(ppi, preset, format);
  const spec = SHEET_PRESETS[preset];
  const cutGuides = showCutGuides && layout.guides.length > 0;
  const sheet = makeCanvas(layout.width, layout.height);
  const ctx = context(sheet);
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (const rect of layout.photos) ctx.drawImage(print, rect.x, rect.y, rect.width, rect.height);
  if (cutGuides) {
    ctx.strokeStyle = "#111827"; ctx.lineWidth = layout.guideWidth; ctx.lineCap = "butt";
    ctx.setLineDash(layout.guideDash); ctx.lineDashOffset = 0;
    ctx.beginPath();
    for (const guide of layout.guides) { ctx.moveTo(guide.x1, guide.y1); ctx.lineTo(guide.x2, guide.y2); }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const outputs: Output[] = [];
  for (const [canvas, name, printSize] of [
    [print, `print-${photoSpec.filename}-${ppi}ppi${suffix}.jpg`, `${photoSpec.label} at ${ppi} PPI`],
    [sheet, `sheet-${spec.width}x${spec.height}-inch-${layout.photos.length}-photos-${photoSpec.filename}-${ppi}ppi${cutGuides ? "-cut-guides" : ""}${suffix}.jpg`,
      `${spec.width} x ${spec.height} inches at ${ppi} PPI`],
  ] as const) {
    const encoded = await jpeg(canvas, 0.97);
    const bytes = setJpegDensity(new Uint8Array(await encoded.arrayBuffer()), ppi);
    const blob = new Blob([bytes], { type: "image/jpeg" });
    await verifyJpeg(blob, canvas.width, canvas.height);
    outputs.push({ name, blob, width: canvas.width, height: canvas.height, printSize });
  }
  if (includePortal) {
    const portal = renderCrop(source, portalRect, 630, 810);
    let accepted: Blob | undefined;
    for (const quality of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7]) {
      const blob = await jpeg(portal, quality);
      if (blob.size < PORTAL_TARGET) { accepted = blob; break; }
    }
    if (!accepted || accepted.size >= PORTAL_LIMIT) {
      throw new Error("The portal JPEG could not meet the byte limit at the minimum allowed encoder quality. Use a cleaner original; dimensions will not be reduced.");
    }
    await verifyJpeg(accepted, 630, 810);
    outputs.push({ name: `india-portal-630x810${suffix}.jpg`, blob: accepted, width: 630, height: 810 });
  }
  return outputs;
}

export function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
