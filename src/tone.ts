export type ToneSettings = { exposure: number; shadows: number; highlights: number; contrast: number };
export type ImageEdits = { background: boolean; lighting: boolean };
export const DEFAULT_TONE: ToneSettings = { exposure: 0, shadows: 0, highlights: 0, contrast: 0 };
export const GENTLE_LIFT: ToneSettings = { exposure: 0.4, shadows: 12, highlights: 0, contrast: 0 };

const linear = Float64Array.from({ length: 256 }, (_, i) => {
  const value = i / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});
const srgb = Uint8ClampedArray.from({ length: 65_536 }, (_, i) => {
  const value = i / 65_535;
  return 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
});
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function validateTone(settings: ToneSettings): void {
  if (!Object.values(settings).every(Number.isFinite) ||
    settings.exposure < -1 || settings.exposure > 1.5 ||
    settings.shadows < 0 || settings.shadows > 40 ||
    settings.highlights < 0 || settings.highlights > 50 ||
    settings.contrast < -20 || settings.contrast > 20) {
    throw new Error("Lighting controls are outside their supported range. Reset the lighting settings.");
  }
}

export function hasTone(settings: ToneSettings): boolean {
  return settings.exposure !== 0 || settings.shadows !== 0 || settings.highlights !== 0 || settings.contrast !== 0;
}

/** A common linear-light gain preserves RGB ratios; highlights cap the gain before channel clipping. */
export function applyTonePixels(input: Uint8ClampedArray, settings: ToneSettings): Uint8ClampedArray<ArrayBuffer> {
  validateTone(settings);
  if (input.length % 4 !== 0) throw new Error("Lighting requires RGBA pixels.");
  const output = input.slice();
  if (!hasTone(settings)) return output;
  const exposure = 2 ** settings.exposure;
  const shadowLift = settings.shadows / 100 * 0.12;
  const highlightReduction = settings.highlights / 100;
  const contrast = 1 + settings.contrast / 100;
  for (let i = 0; i < input.length; i += 4) {
    const r = linear[input[i]], g = linear[input[i + 1]], b = linear[input[i + 2]];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let target = luma * exposure + shadowLift * Math.max(0, 1 - luma / 0.35) ** 2;
    target -= highlightReduction * Math.max(0, target - 0.55);
    target = clamp((target - 0.18) * contrast + 0.18, 0, 1);
    if (luma === 0) {
      const value = srgb[Math.round(target * 65_535)];
      output[i] = value; output[i + 1] = value; output[i + 2] = value;
    } else {
      const gain = Math.min(target / luma, 1 / Math.max(r, g, b));
      output[i] = srgb[Math.round(clamp(r * gain, 0, 1) * 65_535)];
      output[i + 1] = srgb[Math.round(clamp(g * gain, 0, 1) * 65_535)];
      output[i + 2] = srgb[Math.round(clamp(b * gain, 0, 1) * 65_535)];
    }
  }
  return output;
}

export function editSuffix(edits: ImageEdits): string {
  return edits.background && edits.lighting ? "-lighting-and-background-edited" :
    edits.background ? "-background-edited" : edits.lighting ? "-lighting-edited" : "-original-based";
}
