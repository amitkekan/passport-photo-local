import {
  adjustedAlpha, analyzePixels, dimensionsAllowed, MAX_FILE_BYTES, PORTAL_LIMIT, PORTAL_TARGET,
  readHeader, setJpegDensity, sheetLayout, SHEET_PRESETS, sufficientResolution, printDimensions, PRINT_FORMATS,
  type MatteSettings, type Ppi, type Quality, type Rect, type SheetPreset, type PrintFormat,
} from "./core";
import type { PortraitMatte } from "./vision";
import { applyTonePixels, editSuffix, hasTone, type ImageEdits, type ToneSettings } from "./tone";
import { assessBackgroundPixels, BACKGROUND_COLORS, type BackgroundColor } from "./background";
import { decodeHeic } from "./heic";

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
  const mask = makeCanvas(matte.width, matte.height);
  const maskPixels = context(mask).createImageData(matte.width, matte.height);
  for (let i = 0; i < matte.alpha.length; i++) {
    maskPixels.data[i * 4 + 3] = Math.round(adjustedAlpha(matte.alpha[i], settings) * 255);
  }
  context(mask).putImageData(maskPixels, 0, 0);
  const output = makeCanvas(canvas.width, canvas.height);
  const ctx = context(output);
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mask, 0, 0, output.width, output.height);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = BACKGROUND_COLORS[color].css; ctx.fillRect(0, 0, output.width, output.height);
  ctx.globalCompositeOperation = "source-over";
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
    ctx.beginPath();
    for (const guide of layout.guides) { ctx.moveTo(guide.x1, guide.y1); ctx.lineTo(guide.x2, guide.y2); }
    ctx.stroke();
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
