import { readHeicHeader } from "./heic-header";
import type { Eyes } from "./eyes";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PIXELS = 24_000_000;
export const MAX_DIMENSION = 10_000;
export const PORTAL_LIMIT = 250_000;
export const PORTAL_TARGET = 245_000;
export const RULE_VERSION = "2026-10-15-local-1";

export type ApplicationProfile = "india" | "usa" | "generic35x45";
export type Ppi = 300 | 600;
export const PRINT_FORMATS = {
  "2x2": { widthMm: 50.8, heightMm: 50.8, label: "2 x 2 inches", filename: "2x2-inch" },
  "35x45": { widthMm: 35, heightMm: 45, label: "35 x 45 mm", filename: "35x45-mm" },
} as const;
export type PrintFormat = keyof typeof PRINT_FORMATS;
export function printDimensions(format: PrintFormat, ppi: Ppi): { width: number; height: number } {
  if (!Object.hasOwn(PRINT_FORMATS, format) || (ppi !== 300 && ppi !== 600)) throw new Error("Unsupported photo print settings.");
  const spec = PRINT_FORMATS[format];
  return { width: Math.round(spec.widthMm / 25.4 * ppi), height: Math.round(spec.heightMm / 25.4 * ppi) };
}
export type Frame = { zoom: number; x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Quality = {
  mean: number;
  darkFraction: number;
  brightFraction: number;
  sharpness: number;
  leftRightDifference: number;
  backgroundBrightness: number;
  backgroundSpread: number;
  backgroundNeutrality: number;
};
export type Header = { format: "jpeg" | "png" | "heic"; width: number; height: number };

export const INITIAL_FRAME: Frame = { zoom: 1, x: 50, y: 50 };
export type Face = { bounds: Rect; head: Rect; portalHead?: Rect; confidence: number; source: "detected" | "manual"; eyes?: import("./eyes").Eyes };
export type FramingDefaults = { print: Frame; portal: Frame; guides: { top: number; chin: number }; ppi: Ppi };
export type MatteSettings = { cleanup: number; softness: number };
export const DEFAULT_MATTE: MatteSettings = { cleanup: 3, softness: 100 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function estimatedHead(bounds: Rect, width: number, height: number): Rect {
  const top = clamp(bounds.y - bounds.height * 0.30, 0, height);
  const bottom = clamp(bounds.y + bounds.height * 1.04, top, height);
  const x = clamp(bounds.x - bounds.width * 0.06, 0, width);
  return { x, y: top, width: Math.min(bounds.width * 1.12, width - x), height: bottom - top };
}

export function refinePortalHead(face: Face, width: number, height: number, mask: { width: number; height: number; alpha: Float32Array }): Rect | null {
  if (mask.width < 1 || mask.height < 1 || mask.alpha.length !== mask.width * mask.height ||
    !mask.alpha.every(Number.isFinite)) throw new Error("Invalid portrait mask for head framing.");
  if (face.source === "manual") return null;
  const sx = mask.width / width, sy = mask.height / height;
  const bounds = face.bounds;
  const left = Math.max(0, Math.floor((bounds.x + bounds.width * 0.2) * sx));
  const right = Math.min(mask.width, Math.ceil((bounds.x + bounds.width * 0.8) * sx));
  const start = Math.max(0, Math.floor((bounds.y - bounds.height * 0.65) * sy));
  const end = Math.min(mask.height, Math.ceil((bounds.y + bounds.height * 0.25) * sy));
  if (right - left < 6 || end - start < 6) return null;
  let clearRows = 0, solidRows = 0;
  for (let y = start; y < end; y++) {
    let solid = 0, clear = 0;
    for (let x = left; x < right; x++) {
      const alpha = mask.alpha[y * mask.width + x];
      if (alpha >= 0.65) solid++;
      if (alpha <= 0.15) clear++;
    }
    if (clear / (right - left) >= 0.8) clearRows++;
    solidRows = solid / (right - left) >= 0.25 ? solidRows + 1 : 0;
    // Require a real background-to-head transition, not a solid/uncertain mask or a stray pixel.
    if (solidRows === 3) {
      if (clearRows < 3) return null;
      const top = Math.max(0, (y - 2) / sy - bounds.height * 0.03);
      const bottom = face.head.y + face.head.height;
      if (bottom - top < bounds.height * 0.75 || bottom - top > bounds.height * 1.65) return null;
      return { ...face.head, y: top, height: bottom - top };
    }
  }
  return null;
}

export function portalHeadFromGuides(face: Face, print: Rect, guides: { top: number; chin: number }): Rect {
  const top = print.y + print.height * guides.top / 100;
  const bottom = print.y + print.height * guides.chin / 100;
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) {
    throw new Error("Place the head-top guide above the chin before reframing the upload.");
  }
  const corrected = Math.abs(top - face.head.y) > 1e-6 || Math.abs(bottom - face.head.y - face.head.height) > 1e-6;
  return corrected ? { ...face.head, y: top, height: bottom - top } : face.portalHead ?? face.head;
}

export function frameAroundHead(width: number, height: number, head: Rect, ratio: number, fraction: number, topMargin: number, minimumHeight = 0): Frame {
  if (![head.x, head.y, head.width, head.height].every(Number.isFinite) ||
    head.width <= 0 || head.height <= 0 || head.x < 0 || head.y < 0 ||
    head.x + head.width > width + 1e-6 || head.y + head.height > height + 1e-6 ||
    !Number.isFinite(minimumHeight) || minimumHeight < 0) {
    throw new Error("The selected head is outside the original photograph.");
  }
  const maxHeight = Math.min(height, width / ratio);
  const targetHeight = Math.min(maxHeight, Math.max(head.height / fraction, head.width / (ratio * 0.86), minimumHeight));
  const zoom = clamp(maxHeight / targetHeight, 1, 20);
  const actualHeight = maxHeight / zoom;
  const actualWidth = actualHeight * ratio;
  const left = clamp(head.x + head.width / 2 - actualWidth / 2, 0, width - actualWidth);
  const top = clamp(head.y - actualHeight * topMargin, 0, height - actualHeight);
  return {
    zoom,
    x: width - actualWidth > 1e-6 ? left / (width - actualWidth) * 100 : 50,
    y: height - actualHeight > 1e-6 ? top / (height - actualHeight) * 100 : 50,
  };
}

export function suggestFraming(width: number, height: number, face: Face | null, format: PrintFormat = "2x2"): FramingDefaults {
  const high = printDimensions(format, 600);
  const print = face ? frameAroundHead(width, height, face.head, high.width / high.height, 0.60, 0.16) : { ...INITIAL_FRAME };
  const portal = suggestPortalFraming(width, height, face);
  const highRect = cropRect(width, height, high.width / high.height, print);
  const ppi = sufficientResolution(highRect, high.width, high.height) ? 600 : 300;
  const pixels = printDimensions(format, ppi);
  const rect = cropRect(width, height, pixels.width / pixels.height, print);
  const guides = face ? {
    top: clamp((face.head.y - rect.y) / rect.height * 100, 0, 100),
    chin: clamp((face.head.y + face.head.height - rect.y) / rect.height * 100, 0, 100),
  } : { top: 20, chin: 80 };
  return { print, portal, guides, ppi };
}

export function suggestPortalFraming(width: number, height: number, face: Face | null, eyes: Eyes | undefined = face?.eyes): Frame {
  if (!face) return { ...INITIAL_FRAME };
  const head = face.portalHead ?? face.head;
  let frame = frameAroundHead(width, height, head, 7 / 9, 0.80, 0.05);
  const initial = cropRect(width, height, 7 / 9, frame);
  if (initial.height < 811 && initial.height * 1.10 >= 811) {
    frame = frameAroundHead(width, height, head, 7 / 9, 0.80, 0.05, 811);
  }
  if (!eyes) return frame;
  if (![eyes.left, eyes.right].every(point => Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height)) {
    throw new Error("Correct the eye markers before reframing the upload.");
  }
  const rect = cropRect(width, height, 7 / 9, frame);
  const centerX = (eyes.left.x + eyes.right.x) / 2;
  // Center between the pupils without moving the crown toward an arbitrary eye-height target.
  const minLeft = Math.max(0, head.x + head.width + rect.width * 0.06 - rect.width);
  const maxLeft = Math.min(width - rect.width, head.x - rect.width * 0.06);
  const left = minLeft <= maxLeft ? clamp(centerX - rect.width / 2, minLeft, maxLeft) : rect.x;
  return {
    zoom: frame.zoom,
    x: width - rect.width > 1e-6 ? left / (width - rect.width) * 100 : 50,
    y: frame.y,
  };
}

export function adjustedAlpha(value: number, settings: MatteSettings): number {
  if (!Number.isFinite(value) || settings.cleanup < 0 || settings.cleanup > 20 ||
    settings.softness < 0 || settings.softness > 100) throw new Error("Invalid portrait edge settings.");
  const low = settings.cleanup / 100;
  const alpha = clamp((value - low) / (0.98 - low), 0, 1);
  const hard = alpha >= 0.5 ? 1 : 0;
  return hard + (alpha - hard) * settings.softness / 100;
}

export function reprojectGuides(oldRect: Rect, nextRect: Rect, guides: { top: number; chin: number }) {
  return {
    top: (oldRect.y + oldRect.height * guides.top / 100 - nextRect.y) / nextRect.height * 100,
    chin: (oldRect.y + oldRect.height * guides.chin / 100 - nextRect.y) / nextRect.height * 100,
  };
}

export function dimensionsAllowed(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) &&
    width > 0 && height > 0 &&
    width <= MAX_DIMENSION && height <= MAX_DIMENSION &&
    width * height <= MAX_PIXELS;
}

export function readHeader(data: Uint8Array): Header {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length >= 12 && view.getUint32(4) === 0x66747970) return readHeicHeader(data);
  if (data.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value)) {
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) {
      throw new Error("The PNG header is invalid.");
    }
    return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error("Please choose an original JPEG, PNG, or HEIC/HEIF still photo. PDF, SVG and other formats are not supported.");
  }
  let offset = 2;
  while (offset < data.length) {
    if (data[offset++] !== 0xff) throw new Error("The JPEG marker structure is invalid.");
    while (offset < data.length && data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) break;
    const size = view.getUint16(offset);
    if (size < 2 || offset + size > data.length) throw new Error("The JPEG is truncated or damaged.");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 8) throw new Error("The JPEG dimensions are missing.");
      return { format: "jpeg", width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += size;
  }
  throw new Error("Could not read supported JPEG dimensions. Try an original baseline or progressive JPEG.");
}

export function cropRect(width: number, height: number, ratio: number, frame: Frame): Rect {
  if (![width, height, ratio, frame.zoom, frame.x, frame.y].every(Number.isFinite) ||
    width <= 0 || height <= 0 || ratio <= 0 || frame.zoom < 1 ||
    frame.x < 0 || frame.x > 100 || frame.y < 0 || frame.y > 100) {
    throw new Error("Invalid crop dimensions or controls.");
  }
  const cropWidth = Math.min(width, height * ratio) / frame.zoom;
  const cropHeight = cropWidth / ratio;
  return {
    x: (width - cropWidth) * frame.x / 100,
    y: (height - cropHeight) * frame.y / 100,
    width: cropWidth,
    height: cropHeight,
  };
}

export function sufficientResolution(rect: Rect, width: number, height: number): boolean {
  return rect.width >= width && rect.height >= height;
}

export function headSizeInches(topPercent: number, chinPercent: number): number {
  return (chinPercent - topPercent) / 100 * 2;
}

export function validHeadSize(topPercent: number, chinPercent: number): boolean {
  const size = headSizeInches(topPercent, chinPercent);
  return topPercent >= 0 && chinPercent <= 100 && size >= 1 && size <= 1.375;
}

export function validPrintHead(topPercent: number, chinPercent: number, format: PrintFormat): boolean {
  return format === "2x2" ? validHeadSize(topPercent, chinPercent) :
    Number.isFinite(topPercent) && Number.isFinite(chinPercent) && topPercent >= 0 && chinPercent <= 100 && chinPercent > topPercent;
}

export const SHEET_PRESETS = {
  "5x7": { width: 5, height: 7, columns: 2, rows: 3, gap: 0.25 },
  "4x6": { width: 4, height: 6, columns: 1, rows: 2, gap: 0.25 },
} as const;
export type SheetPreset = keyof typeof SHEET_PRESETS;
export type CutGuide = { x1: number; y1: number; x2: number; y2: number };
export function isSheetPreset(value: string): value is SheetPreset {
  return Object.hasOwn(SHEET_PRESETS, value);
}

export function sheetLayout(ppi: Ppi, preset: SheetPreset, format: PrintFormat = "2x2"): {
  width: number; height: number; photos: Rect[]; guides: CutGuide[]; guideWidth: number;
} {
  if ((ppi !== 300 && ppi !== 600) || !isSheetPreset(preset)) throw new Error("Unsupported print-sheet settings.");
  const spec = SHEET_PRESETS[preset];
  const pixels = printDimensions(format, ppi);
  const columns = format === "35x45" ? 2 : spec.columns;
  const gap = spec.gap * ppi;
  const width = spec.width * ppi, height = spec.height * ppi;
  const left = Math.round((width - columns * pixels.width - (columns - 1) * gap) / 2);
  const top = Math.round((height - spec.rows * pixels.height - (spec.rows - 1) * gap) / 2);
  const photos: Rect[] = [];
  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < columns; col++) {
      photos.push({
        x: left + col * (pixels.width + gap),
        y: top + row * (pixels.height + gap),
        width: pixels.width,
        height: pixels.height,
      });
    }
  }
  const guides: CutGuide[] = [];
  // Each mark sits in waste paper, separated from the photo by 0.03 inches.
  if (spec.gap > 0) {
    const offset = 0.03 * ppi, length = 0.08 * ppi;
    for (const photo of photos) {
      for (const x of [photo.x, photo.x + photo.width]) {
        guides.push({ x1: x, x2: x, y1: photo.y - offset - length, y2: photo.y - offset });
        guides.push({ x1: x, x2: x, y1: photo.y + photo.height + offset, y2: photo.y + photo.height + offset + length });
      }
      for (const y of [photo.y, photo.y + photo.height]) {
        guides.push({ x1: photo.x - offset - length, x2: photo.x - offset, y1: y, y2: y });
        guides.push({ x1: photo.x + photo.width + offset, x2: photo.x + photo.width + offset + length, y1: y, y2: y });
      }
    }
  }
  return { width, height, photos, guides, guideWidth: ppi / 200 };
}

export function analyzePixels(data: Uint8ClampedArray, width: number, height: number): Quality {
  if (width < 8 || height < 8 || data.length !== width * height * 4) {
    throw new Error("Image is too small to analyze.");
  }
  const luma = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  let count = 0, total = 0, dark = 0, bright = 0, lap = 0, lap2 = 0;
  let left = 0, right = 0, leftCount = 0, rightCount = 0;
  for (let y = Math.max(1, Math.floor(height * 0.15)); y < Math.min(height - 1, height * 0.75); y++) {
    for (let x = Math.max(1, Math.floor(width * 0.25)); x < Math.min(width - 1, width * 0.75); x++) {
      const value = luma(x, y);
      total += value; count++;
      if (value < 20) dark++;
      if (value > 249) bright++;
      if (x < width / 2) { left += value; leftCount++; } else { right += value; rightCount++; }
      const delta = luma(x - 1, y) + luma(x + 1, y) + luma(x, y - 1) + luma(x, y + 1) - 4 * value;
      lap += delta; lap2 += delta * delta;
    }
  }
  const corners: number[] = [];
  let neutrality = 0;
  for (const [sx, sy] of [[0, 0], [0.9, 0], [0, 0.9], [0.9, 0.9]]) {
    for (let y = Math.floor(height * sy); y < Math.min(height, height * (sy + 0.1)); y++) {
      for (let x = Math.floor(width * sx); x < Math.min(width, width * (sx + 0.1)); x++) {
        const i = (y * width + x) * 4;
        corners.push(luma(x, y));
        neutrality += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      }
    }
  }
  const backgroundBrightness = corners.reduce((sum, value) => sum + value, 0) / corners.length;
  return {
    mean: total / count, darkFraction: dark / count, brightFraction: bright / count,
    sharpness: Math.max(0, lap2 / count - (lap / count) ** 2),
    leftRightDifference: Math.abs(left / leftCount - right / rightCount),
    backgroundBrightness,
    backgroundSpread: Math.sqrt(corners.reduce((sum, value) => sum + (value - backgroundBrightness) ** 2, 0) / corners.length),
    backgroundNeutrality: neutrality / corners.length,
  };
}

/** Conservative edge-connected color selection, not person segmentation. */
export function backgroundMask(data: Uint8ClampedArray, width: number, height: number, tolerance: number): Uint8ClampedArray {
  if (data.length !== width * height * 4 || width < 2 || height < 2 || tolerance < 5 || tolerance > 60) {
    throw new Error("Invalid background selection input.");
  }
  const cornerIds = [0, width - 1, (height - 1) * width, width * height - 1];
  const color = [0, 1, 2].map(channel => cornerIds.reduce((sum, i) => sum + data[i * 4 + channel], 0) / 4);
  const distance = (i: number) => Math.sqrt([0, 1, 2].reduce((sum, c) => sum + (data[i * 4 + c] - color[c]) ** 2, 0) / 3);
  if (cornerIds.some(i => distance(i) > tolerance)) {
    throw new Error("The corners are not a consistent background color. This simple tool cannot safely isolate the person. Retake against a plain background.");
  }
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  const mask = new Uint8ClampedArray(width * height * 4);
  let start = 0, end = 0;
  const visit = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    if (distance(i) <= tolerance && data[i * 4 + 3] === 255) queue[end++] = i;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (start < end) {
    const i = queue[start++];
    mask[i * 4] = 255; mask[i * 4 + 1] = 255; mask[i * 4 + 2] = 255; mask[i * 4 + 3] = 255;
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < width * (height - 1)) visit(i + width);
  }
  const fraction = end / (width * height);
  if (fraction < 0.02 || fraction > 0.80) {
    throw new Error("Background selection is too small or too broad. No edit was applied; choose a better original or lower the tolerance.");
  }
  return mask;
}

/** JFIF density provides physical print size; encoded photo pixels are not modified. */
export function setJpegDensity(bytes: Uint8Array, ppi: Ppi): Uint8Array<ArrayBuffer> {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("JPEG output is invalid.");
  const result = bytes.slice();
  let offset = 2;
  while (offset + 4 < result.length && result[offset] === 0xff) {
    const marker = result[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = result[offset + 2] * 256 + result[offset + 3];
    if (length < 2 || offset + 2 + length > result.length) throw new Error("Malformed JPEG output.");
    if (marker === 0xe0 && length >= 16 &&
      [74, 70, 73, 70, 0].every((value, i) => result[offset + 4 + i] === value)) {
      result[offset + 11] = 1;
      result[offset + 12] = ppi >> 8; result[offset + 13] = ppi & 255;
      result[offset + 14] = ppi >> 8; result[offset + 15] = ppi & 255;
      return result;
    }
    offset += 2 + length;
  }
  const jfif = new Uint8Array([255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, ppi >> 8, ppi & 255, ppi >> 8, ppi & 255, 0, 0]);
  const withHeader = new Uint8Array(result.length + jfif.length);
  withHeader.set(result.subarray(0, 2)); withHeader.set(jfif, 2); withHeader.set(result.subarray(2), 2 + jfif.length);
  return withHeader;
}
