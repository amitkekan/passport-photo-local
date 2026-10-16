export const BACKGROUND_COLORS = {
  white: { label: "White", css: "#ffffff" },
  neutral: { label: "Very light neutral", css: "#f5f5f5" },
  warm: { label: "Very light warm", css: "#faf8f4" },
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
