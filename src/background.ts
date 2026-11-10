export const BACKGROUND_COLORS = {
  white: { label: "White", css: "#ffffff", rgb: [255, 255, 255] },
  neutral: { label: "Very light neutral", css: "#f5f5f5", rgb: [245, 245, 245] },
  warm: { label: "Very light warm", css: "#faf8f4", rgb: [250, 248, 244] },
} as const;
export type BackgroundColor = keyof typeof BACKGROUND_COLORS;
export const BACKGROUND_COLOR_LIMITS = { meanSpread: 50, strongSpread: 80, strongFraction: 0.03 } as const;
export type BackgroundAssessment = {
  eligible: boolean;
  reason: string;
  metrics: { coverage: number; brightness: number; spread: number; colorfulness: number; colorfulFraction: number; texturedFraction: number; darkFraction: number; deepDarkFraction: number };
};

/** Conservative appearance checks, not a semantic wall/forest classifier or passport rule. */
export function assessBackgroundPixels(data: Uint8ClampedArray, alpha: Float32Array, width: number, height: number): BackgroundAssessment {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
    data.length !== width * height * 4 || alpha.length !== width * height ||
    !alpha.every(value => Number.isFinite(value) && value >= -0.001 && value <= 1.001)) {
    throw new Error("Background assessment received an invalid image or portrait mask.");
  }
  let count = 0, sum = 0, sumSquares = 0, chroma = 0, colorful = 0, dark = 0, deepDark = 0;
  let edges = 0, pairs = 0, uncertain = 0, left = 0, right = 0, top = 0;
  // Integer coefficients preserve exact grayscale values at the brightness boundary.
  const luma = (i: number) => (data[i * 4] * 2126 + data[i * 4 + 1] * 7152 + data[i * 4 + 2] * 722) / 10000;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] > 0.05 && alpha[i] < 0.9) uncertain++;
    if (alpha[i] > 0.05) continue;
    const x = i % width, y = Math.floor(i / width), value = luma(i);
    count++; sum += value; sumSquares += value * value;
    const difference = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    chroma += difference;
    if (difference > BACKGROUND_COLOR_LIMITS.strongSpread) colorful++;
    if (value < 120) dark++;
    if (value < 65) deepDark++;
    if (x < width / 3) left++;
    if (x > width * 2 / 3) right++;
    if (y < height * 0.12) top++;
    for (const neighbor of [x > 0 ? i - 1 : -1, y > 0 ? i - width : -1]) {
      if (neighbor < 0 || alpha[neighbor] > 0.05) continue;
      pairs++;
      if (Math.abs(value - luma(neighbor)) > 12) edges++;
    }
  }
  const metrics = {
    coverage: count / alpha.length,
    brightness: count ? sum / count : 0,
    spread: count ? Math.sqrt(Math.max(0, sumSquares / count - (sum / count) ** 2)) : 0,
    colorfulness: count ? chroma / count : 0,
    colorfulFraction: count ? colorful / count : 0,
    texturedFraction: pairs ? edges / pairs : 0,
    darkFraction: count ? dark / count : 0,
    deepDarkFraction: count ? deepDark / count : 0,
  };
  const rejected = (reason: string): BackgroundAssessment => ({ eligible: false, reason, metrics });
  if (metrics.coverage < 0.15 || uncertain / alpha.length > 0.35 || count < 64 ||
    left < alpha.length * 0.03 || right < alpha.length * 0.03 || top < alpha.length * 0.02) {
    return rejected("Not enough confidently separated background surrounds the person. Retake against a clearer plain light wall.");
  }
  if (metrics.brightness < 140) return rejected("The sampled background is too dim overall for light-wall correction. Underexposed light gray and off-white walls are supported, but a very dark capture needs better lighting.");
  if (metrics.deepDarkFraction > 0.005) return rejected("Near-black patches were found in the estimated background. They may be objects, deep shadows, or hair/clothing missed by the portrait mask. This is not proof that your wall is dark; correction is blocked to avoid erasing part of the person.");
  if (metrics.darkFraction > 0.15) return rejected("Too much of the estimated background is strongly shadowed. Moderate wall shading is allowed, but large dark areas need more even lighting. A missed part of the person can also cause this result.");
  if (metrics.colorfulness > BACKGROUND_COLOR_LIMITS.meanSpread || metrics.colorfulFraction > BACKGROUND_COLOR_LIMITS.strongFraction) {
    return rejected("The sampled background color is too intense for light-wall correction. Light cream and muted pastel walls are supported, but vivid colors are not.");
  }
  if (metrics.spread > 35 || metrics.texturedFraction > 0.015) return rejected("The original background has too much texture or contrast. Mild shading is allowed, but busy scenes and strong patterns need a retake.");
  const lightingNote = metrics.brightness < 160 || metrics.darkFraction > 0.05
    ? " The wall appears underexposed or shadowed. Whitening it will not fix dark facial lighting; review the face separately."
    : "";
  return { eligible: true, reason: `Background appearance is within the light-wall correction limits.${lightingNote} Inspect the preview for missing hair or clothing. This does not prove it is a wall or establish passport compliance.`, metrics };
}

const LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const value = i / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});
const encode = (value: number) => {
  const v = Math.max(0, Math.min(1, value));
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
};
// Edge-color tuning: linear-light foreground/background contrast where color-based edge tightening begins and reaches full strength.
export const EDGE_COLOR = { minContrast: 0.05, fullContrast: 0.2, radiusFraction: 0.03, backgroundAlpha: 0.05, foregroundAlpha: 0.95 } as const;

/** Local linear-light colors of confident background and confident person pixels, at mask resolution. */
export type ColorField = { width: number; height: number; background: Float32Array; foreground: Float32Array };

function normalizedBlur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  // values holds [r, g, b, weight] premultiplied by weight; separable box blur keeps the sums proportional.
  const temp = new Float32Array(values.length), out = new Float32Array(values.length);
  for (let y = 0; y < height; y++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += values[(y * width + Math.max(0, Math.min(width - 1, x))) * 4 + c];
    for (let x = 0; x < width; x++) {
      temp[(y * width + x) * 4 + c] = sum;
      sum += values[(y * width + Math.min(width - 1, x + radius + 1)) * 4 + c] - values[(y * width + Math.max(0, x - radius)) * 4 + c];
    }
  }
  for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += temp[(Math.max(0, Math.min(height - 1, y)) * width + x) * 4 + c];
    for (let y = 0; y < height; y++) {
      out[(y * width + x) * 4 + c] = sum;
      sum += temp[(Math.min(height - 1, y + radius + 1) * width + x) * 4 + c] - temp[(Math.max(0, y - radius) * width + x) * 4 + c];
    }
  }
  return out;
}

function localColors(data: Uint8ClampedArray, alpha: Float32Array, width: number, height: number, include: (a: number) => boolean): Float32Array {
  const n = width * height, weighted = new Float32Array(n * 4), mean = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!include(alpha[i])) continue;
    for (let c = 0; c < 3; c++) { const v = LINEAR[data[i * 4 + c]]; weighted[i * 4 + c] = v; mean[c] += v; }
    weighted[i * 4 + 3] = 1; count++;
  }
  const result = new Float32Array(n * 3);
  if (count === 0) return result.fill(1);
  const radius = Math.max(2, Math.round(Math.max(width, height) * EDGE_COLOR.radiusFraction));
  const near = normalizedBlur(weighted, width, height, radius), far = normalizedBlur(weighted, width, height, radius * 4);
  for (let i = 0; i < n; i++) {
    const source = near[i * 4 + 3] > 0.5 ? near : far[i * 4 + 3] > 0.5 ? far : null;
    for (let c = 0; c < 3; c++) result[i * 3 + c] = source ? source[i * 4 + c] / source[i * 4 + 3] : mean[c] / count;
  }
  return result;
}

export function estimateColorField(data: Uint8ClampedArray, rawAlpha: Float32Array, width: number, height: number): ColorField {
  if (data.length !== width * height * 4 || rawAlpha.length !== width * height) throw new Error("Edge color estimation received mismatched pixels and mask.");
  return {
    width, height,
    background: localColors(data, rawAlpha, width, height, a => a < EDGE_COLOR.backgroundAlpha),
    foreground: localColors(data, rawAlpha, width, height, a => a > EDGE_COLOR.foregroundAlpha),
  };
}

/**
 * Replaces the background in place. Soft edges remove the estimated original background color in linear light
 * (color decontamination) instead of blending it into the new color. Where person and wall colors differ clearly,
 * mask-edge pixels whose color matches the wall are made more transparent. Alpha is never increased.
 */
export function compositeEdgePixels(data: Uint8ClampedArray, width: number, height: number, alpha: Float32Array, field: ColorField, color: readonly [number, number, number]): void {
  if (data.length !== width * height * 4 || alpha.length !== field.width * field.height) throw new Error("Background compositing received mismatched pixels and mask.");
  const mw = field.width, mh = field.height, sx = mw / width, sy = mh / height;
  const white = color.map(v => LINEAR[v]);
  const B = [0, 0, 0], F = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    const my = Math.max(0, Math.min(mh - 1, (y + 0.5) * sy - 0.5)), y0 = Math.min(mh - 2, Math.floor(my)), ty = mh > 1 ? my - y0 : 0;
    for (let x = 0; x < width; x++) {
      const mx = Math.max(0, Math.min(mw - 1, (x + 0.5) * sx - 0.5)), x0 = Math.min(mw - 2, Math.floor(mx)), tx = mw > 1 ? mx - x0 : 0;
      const i00 = Math.max(0, y0) * mw + Math.max(0, x0), i10 = i00 + (mw > 1 ? 1 : 0), i01 = i00 + (mh > 1 ? mw : 0), i11 = i01 + (mw > 1 ? 1 : 0);
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      let a = alpha[i00] * w00 + alpha[i10] * w10 + alpha[i01] * w01 + alpha[i11] * w11;
      const o = (y * width + x) * 4;
      if (a >= 0.999) continue;
      if (a > 0.001) {
        for (let c = 0; c < 3; c++) {
          B[c] = field.background[i00 * 3 + c] * w00 + field.background[i10 * 3 + c] * w10 + field.background[i01 * 3 + c] * w01 + field.background[i11 * 3 + c] * w11;
          F[c] = field.foreground[i00 * 3 + c] * w00 + field.foreground[i10 * 3 + c] * w10 + field.foreground[i01 * 3 + c] * w01 + field.foreground[i11 * 3 + c] * w11;
        }
        const I = [LINEAR[data[o]], LINEAR[data[o + 1]], LINEAR[data[o + 2]]];
        const d = [F[0] - B[0], F[1] - B[1], F[2] - B[2]], contrast = Math.hypot(d[0], d[1], d[2]);
        const strength = Math.max(0, Math.min(1, (contrast - EDGE_COLOR.minContrast) / (EDGE_COLOR.fullContrast - EDGE_COLOR.minContrast)));
        if (strength > 0) {
          const colorAlpha = Math.max(0, Math.min(1, ((I[0] - B[0]) * d[0] + (I[1] - B[1]) * d[1] + (I[2] - B[2]) * d[2]) / (contrast * contrast)));
          a -= strength * Math.max(0, a - colorAlpha);
        }
        if (a > 0.001) {
          for (let c = 0; c < 3; c++) {
            const foreground = Math.max(0, Math.min(1, (I[c] - (1 - a) * B[c]) / a));
            data[o + c] = encode(a * foreground + (1 - a) * white[c]);
          }
          data[o + 3] = 255;
          continue;
        }
      }
      data[o] = color[0]; data[o + 1] = color[1]; data[o + 2] = color[2]; data[o + 3] = 255;
    }
  }
}
