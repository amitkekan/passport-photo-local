import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyzePixels, backgroundMask, cropRect, dimensionsAllowed, headSizeInches,
  INITIAL_FRAME, PORTAL_LIMIT, PORTAL_TARGET, readHeader, setJpegDensity,
  sheetLayout, SHEET_PRESETS, isSheetPreset, sufficientResolution, validHeadSize, suggestFraming, estimatedHead, DEFAULT_MATTE, adjustedAlpha, reprojectGuides,
  printDimensions, PRINT_FORMATS, validPrintHead, frameAroundHead, suggestPortalFraming, refinePortalHead, portalHeadFromGuides,
} from "../src/core.ts";
import { applyTonePixels, DEFAULT_TONE, GENTLE_LIFT, editSuffix, hasTone } from "../src/tone.ts";
import { assessBackgroundPixels, BACKGROUND_COLORS, compositeEdgePixels, estimateColorField } from "../src/background.ts";
import { eyeMeasurements, eyesWithinTarget, validEyeTarget } from "../src/eyes.ts";
import {
  estimatePose, eyeLineDegrees, fromStraightened, mapEyes, MAX_STRAIGHTEN_DEGREES, POSE_LIMITS, straightenBounds, straightening, straightenWeight, toStraightened, validStraightenDegrees,
} from "../src/pose.ts";

test("HEIC preflight reads coded dimensions without decoding and rejects malformed or oversized containers", () => {
  const source = readFileSync(new URL("./fixtures/rainbow-451x461.heic", import.meta.url));
  assert.deepEqual(readHeader(source), { format: "heic", width: 452, height: 462 });
  assert.throws(() => readHeader(source.subarray(0, 60)), /HEIC/);
  const damaged = Buffer.from(source);
  damaged.writeUInt32BE(7, 0);
  assert.throws(() => readHeader(damaged), /HEIC/);
  const oversized = Buffer.from(source);
  oversized.writeUInt32BE(10001, oversized.indexOf("ispe") + 8);
  const header = readHeader(oversized);
  assert.equal(dimensionsAllowed(header.width, header.height), false);
  const wrongCodec = Buffer.from(source);
  for (let offset = 8; offset < wrongCodec.readUInt32BE(0); offset += 4) {
    if (["heic", "heix"].includes(wrongCodec.toString("ascii", offset, offset + 4))) wrongCodec.write("avif", offset, "ascii");
  }
  assert.throws(() => readHeader(wrongCodec), /HEVC/);
  const sequence = Buffer.from(source);
  sequence.write("msf1", 8, "ascii");
  assert.throws(() => readHeader(sequence), /sequences|HEVC/);
});

test("HEIC primary images may coexist with a visible derived tone-map item", () => {
  const box = (name: string, ...parts: Buffer[]) => {
    const body = Buffer.concat(parts), header = Buffer.alloc(8);
    header.writeUInt32BE(body.length + 8); header.write(name, 4, "ascii");
    return Buffer.concat([header, body]);
  };
  const u16 = (value: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(value); return b; };
  const u32 = (value: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; };
  const entry = (id: number, type: string) => box("infe", Buffer.from([2, 0, 0, 0]), u16(id), u16(0), Buffer.from(type + "\0"));
  const primary = box("pitm", u32(0), u16(1));
  const info = box("iinf", u32(0), u16(2), entry(1, "grid"), entry(2, "tmap"));
  const properties = box("iprp", box("ipco", box("ispe", u32(0), u32(800), u32(1000))));
  const ftyp = box("ftyp", Buffer.from("heic"), u32(0));
  const make = (...primaryBoxes: Buffer[]) => Buffer.concat([ftyp, box("meta", u32(0), ...primaryBoxes, info, properties)]);
  assert.deepEqual(readHeader(make(primary)), { format: "heic", width: 800, height: 1000 });
  assert.throws(() => readHeader(make(primary, primary)), /HEIC/);
  assert.throws(() => readHeader(make(box("pitm", u32(0), u16(99)))), /primary/);
});

test("portal suggestions use a tighter head-based crop and bounded eye centering without changing print defaults", () => {
  const head = { x: 650, y: 500, width: 550, height: 800 };
  const face = { head, bounds: head, source: "manual" as const, confidence: 1 };
  const eyes = { left: { x: 800, y: 860 }, right: { x: 1100, y: 860 }, source: "manual" as const };
  const frame = suggestPortalFraming(2400, 2400, face, eyes);
  const rect = cropRect(2400, 2400, 7 / 9, frame);
  assert.ok(Math.abs(head.height / rect.height - 0.8) < 1e-9);
  assert.ok(Math.abs(rect.x + rect.width / 2 - 950) < 1e-9);
  const topGap = (head.y - rect.y) / rect.height;
  assert.ok(topGap >= 0.03 - 1e-9 && topGap <= 0.07 + 1e-9);
  assert.ok(rect.y <= head.y && rect.y + rect.height >= head.y + head.height);
  assert.deepEqual(suggestFraming(2400, 2400, { ...face, eyes }).print, suggestFraming(2400, 2400, face).print);
  for (const x of [0, 1850]) for (const y of [0, 1600]) {
    const edgeHead = { ...head, x, y };
    const edgeFace = { ...face, head: edgeHead, bounds: edgeHead };
    const edge = cropRect(2400, 2400, 7 / 9, suggestPortalFraming(2400, 2400, edgeFace));
    assert.ok(edge.x >= 0 && edge.y >= 0 && edge.x + edge.width <= 2400 + 1e-6 && edge.y + edge.height <= 2400 + 1e-6);
  }
});

test("portal crown refinement follows a sustained visible boundary, not face-box padding or stray mask pixels", () => {
  const bounds = { x: 300, y: 300, width: 400, height: 400 };
  const face = { bounds, head: estimatedHead(bounds, 1000, 1200), source: "detected" as const, confidence: 1 };
  const alpha = new Float32Array(100 * 120);
  for (let y = 25; y < 100; y++) for (let x = 30; x < 70; x++) alpha[y * 100 + x] = 1;
  alpha[12 * 100 + 50] = 1;
  const mask = { width: 100, height: 120, alpha };
  const head = refinePortalHead(face, 1000, 1200, mask);
  assert.ok(head);
  assert.equal(head.y, 238); // Visible crown at 250, with 3% face-height edge allowance.
  assert.equal(head.y + head.height, face.head.y + face.head.height);
  assert.equal(head.x, face.head.x);
  assert.equal(head.width, face.head.width);
  const original = suggestFraming(1000, 1200, face);
  const refined = suggestFraming(1000, 1200, { ...face, portalHead: head });
  assert.deepEqual(refined.print, original.print);
  assert.deepEqual(refined.guides, original.guides);
  assert.equal(refined.ppi, original.ppi);
  assert.notDeepEqual(refined.portal, original.portal);
  const rect = cropRect(1000, 1200, 7 / 9, refined.portal);
  assert.ok(Math.abs((head.y - rect.y) / rect.height - 0.05) < 1e-9);
  assert.ok(rect.y <= 250 && rect.y + rect.height >= head.y + head.height);
  assert.equal(refinePortalHead({ ...face, source: "manual" }, 1000, 1200, mask), null);
});

test("ambiguous crown masks do not masquerade as successful refinement", () => {
  const bounds = { x: 300, y: 300, width: 400, height: 400 };
  const face = { bounds, head: estimatedHead(bounds, 1000, 1200), source: "detected" as const, confidence: 1 };
  for (const value of [0, 0.5, 1]) {
    const mask = { width: 100, height: 120, alpha: new Float32Array(12000).fill(value) };
    assert.equal(refinePortalHead(face, 1000, 1200, mask), null);
  }
  assert.throws(() => refinePortalHead(face, 1000, 1200, { width: 100, height: 120, alpha: new Float32Array(1) }), /Invalid portrait mask/);
});

test("portal reframe honors corrected source-anchored head guides, preserving real width and print geometry", () => {
  const head = { x: 650, y: 400, width: 550, height: 900 };
  const refined = { ...head, y: 500, height: 800 };
  const face = { head, bounds: head, portalHead: refined, source: "detected" as const, confidence: 1 };
  const print = { x: 100, y: 100, width: 1500, height: 1500 };
  const guides = { top: 20, chin: 80 };
  assert.deepEqual(portalHeadFromGuides(face, print, guides), refined);
  const corrected = portalHeadFromGuides(face, print, { top: 30, chin: 78 });
  assert.deepEqual(corrected, { x: 650, y: 550, width: 550, height: 720 });
  const moved = { ...print, y: 200, height: 1400, width: 1400 };
  assert.deepEqual(portalHeadFromGuides(face, moved, reprojectGuides(print, moved, guides)), refined);
  assert.throws(() => portalHeadFromGuides(face, print, { top: 80, chin: 20 }), /head-top guide/);
  assert.throws(() => portalHeadFromGuides(face, print, { top: NaN, chin: 80 }), /head-top guide/);
});

test("eye height does not change portal headroom across face proportions and image orientations", () => {
  for (const [width, height] of [[2400, 3000], [3000, 2400], [2400, 2400]]) {
    for (const headWidth of [500, 650, 800]) {
      const head = { x: 800, y: 600, width: headWidth, height: 900 };
      const face = { head, bounds: head, source: "manual" as const, confidence: 1 };
      for (const fraction of [0.35, 0.5, 0.65]) {
        const eyes = { left: { x: head.x + headWidth * 0.3, y: head.y + head.height * fraction },
          right: { x: head.x + headWidth * 0.7, y: head.y + head.height * fraction }, source: "manual" as const };
        const frame = suggestPortalFraming(width, height, face, eyes);
        assert.equal(frame.y, suggestPortalFraming(width, height, face).y);
        const rect = cropRect(width, height, 7 / 9, frame);
        assert.ok(Math.abs((head.y - rect.y) / rect.height - 0.05) < 1e-9);
        assert.ok(rect.x <= head.x && rect.x + rect.width >= head.x + head.width);
        assert.ok(rect.y + rect.height >= head.y + head.height);
      }
    }
  }
});

function backgroundFixture(color: (x: number, y: number) => number[]) {
  const width = 80, height = 100, data = new Uint8ClampedArray(width * height * 4), alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const foreground = x > 25 && x < 55 && y > 20;
    alpha[i] = foreground ? 1 : 0;
    data.set([...(foreground ? [180, 30, 20] : color(x, y)), 255], i * 4);
  }
  return { data, alpha, width, height };
}

test("background correction accepts a light wall and faint waves without judging foreground colors", () => {
  for (const color of [
    () => [230, 230, 230],
    () => [170, 170, 170],
    () => [150, 150, 150],
    (x: number) => { const value = 170 + Math.round(35 * x / 79); return [value, value, value]; },
    (x: number) => { const value = 220 + Math.round(6 * Math.sin(x / 4)); return [value, value, value]; },
    () => [240, 235, 225],
    () => [220, 205, 175],
    () => [190, 210, 235],
    () => [225, 195, 215],
  ]) {
    const f = backgroundFixture(color);
    assert.equal(assessBackgroundPixels(f.data, f.alpha, f.width, f.height).eligible, true);
  }
});

test("background correction rejects dark, colorful, textured and uncertain scenes with explicit reasons", () => {
  for (const color of [
    () => [130, 130, 130],
    () => [175, 220, 165],
    () => [140, 170, 230],
    () => [240, 180, 210],
    (x: number, y: number) => { const v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 200 : 240; return [v, v, v]; },
  ]) {
    const f = backgroundFixture(color), result = assessBackgroundPixels(f.data, f.alpha, f.width, f.height);
    assert.equal(result.eligible, false);
    assert.ok(result.reason.length > 20);
  }
  const f = backgroundFixture(() => [240, 240, 240]);
  f.alpha.fill(0.5);
  assert.equal(assessBackgroundPixels(f.data, f.alpha, f.width, f.height).eligible, false);
  f.alpha[0] = NaN;
  assert.throws(() => assessBackgroundPixels(f.data, f.alpha, f.width, f.height), /invalid/);
});

test("background limits are measurable engineering checks rather than successful defaults", () => {
  const boundary = backgroundFixture(() => [140, 140, 140]);
  assert.equal(assessBackgroundPixels(boundary.data, boundary.alpha, boundary.width, boundary.height).eligible, true);
  const dark = backgroundFixture(() => [139, 139, 139]);
  assert.equal(assessBackgroundPixels(dark.data, dark.alpha, dark.width, dark.height).eligible, false);
  const empty = backgroundFixture(() => [240, 240, 240]);
  empty.alpha.fill(1);
  assert.equal(assessBackgroundPixels(empty.data, empty.alpha, empty.width, empty.height).eligible, false);
});

test("light-wall color limits admit cream and pastels but bound mean and vivid-pixel coverage", () => {
  const boundary = backgroundFixture(() => [200, 180, 150]);
  const result = assessBackgroundPixels(boundary.data, boundary.alpha, boundary.width, boundary.height);
  assert.equal(result.metrics.colorfulness, 50);
  assert.equal(result.eligible, true);
  const excessive = backgroundFixture(() => [201, 180, 150]);
  assert.equal(assessBackgroundPixels(excessive.data, excessive.alpha, excessive.width, excessive.height).eligible, false);

  const width = 100, height = 100, data = new Uint8ClampedArray(width * height * 4);
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) data.set([200, 200, 200, 255], i * 4);
  for (let i = 0; i < 300; i++) data.set([230, 200, 150, 255], i * 4);
  assert.equal(assessBackgroundPixels(data, alpha, width, height).metrics.colorfulFraction, 0);
  for (let i = 0; i < 300; i++) data.set([231, 200, 150, 255], i * 4);
  const allowed = assessBackgroundPixels(data, alpha, width, height);
  assert.equal(allowed.metrics.colorfulFraction, 0.03);
  assert.equal(allowed.eligible, true);
  data.set([231, 200, 150, 255], 300 * 4);
  const rejected = assessBackgroundPixels(data, alpha, width, height);
  assert.equal(rejected.eligible, false);
  assert.match(rejected.reason, /color is too intense/);
});

test("small moderate shadows pass while large shadows, deep patches and uncertain masks remain blocked", () => {
  const assess = (shadow: number, fraction: number) => {
    const f = backgroundFixture(() => [205, 205, 205]);
    const background = Array.from(f.alpha.keys()).filter(i => f.alpha[i] <= 0.05);
    for (const i of background.slice(0, Math.floor(background.length * fraction))) f.data.set([shadow, shadow, shadow, 255], i * 4);
    return assessBackgroundPixels(f.data, f.alpha, f.width, f.height);
  };
  const moderate = assess(110, 0.04);
  assert.equal(moderate.eligible, true);
  assert.ok(moderate.metrics.darkFraction > 0.005 && moderate.metrics.darkFraction <= 0.05);
  assert.equal(moderate.metrics.deepDarkFraction, 0);
  const shaded = assess(110, 0.12);
  assert.equal(shaded.eligible, true);
  assert.match(shaded.reason, /will not fix dark facial lighting/);
  const large = assess(110, 0.16);
  assert.equal(large.eligible, false);
  assert.match(large.reason, /strongly shadowed/);
  const deep = assess(40, 0.01);
  assert.equal(deep.eligible, false);
  assert.match(deep.reason, /hair\/clothing missed/);
  const uncertain = backgroundFixture(() => [205, 205, 205]);
  uncertain.alpha.fill(0.5);
  assert.equal(assessBackgroundPixels(uncertain.data, uncertain.alpha, uncertain.width, uncertain.height).eligible, false);
});

test("shadow limits include their exact boundaries and never mutate source pixels or the mask", () => {
  const width = 100, height = 100, data = new Uint8ClampedArray(width * height * 4);
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) data.set([200, 200, 200, 255], i * 4);
  for (let i = 0; i < 1500; i++) data.set([110, 110, 110, 255], i * 4);
  const before = data.slice(), beforeAlpha = alpha.slice();
  assert.equal(assessBackgroundPixels(data, alpha, width, height).eligible, true);
  assert.deepEqual(data, before);
  assert.deepEqual(alpha, beforeAlpha);
  data.set([110, 110, 110, 255], 1500 * 4);
  assert.match(assessBackgroundPixels(data, alpha, width, height).reason, /strongly shadowed/);
  data.set([200, 200, 200, 255], 1500 * 4);
  for (let i = 0; i < 50; i++) data.set([64, 64, 64, 255], i * 4);
  assert.equal(assessBackgroundPixels(data, alpha, width, height).eligible, true);
  data.set([64, 64, 64, 255], 50 * 4);
  assert.match(assessBackgroundPixels(data, alpha, width, height).reason, /Near-black/);
  for (let i = 0; i < 1500; i++) data.set([120, 120, 120, 255], i * 4);
  assert.equal(assessBackgroundPixels(data, alpha, width, height).metrics.darkFraction, 0);
  for (const deviation of [35, 36]) {
    for (let i = 0; i < alpha.length; i++) {
      const value = 200 + (i % width < width / 2 ? -deviation : deviation);
      data.set([value, value, value, 255], i * 4);
    }
    const result = assessBackgroundPixels(data, alpha, width, height);
    assert.equal(result.metrics.spread, deviation);
    assert.equal(result.eligible, deviation === 35);
  }
});

test("eye measurements remain source anchored and custom bands check both eyes from the bottom", () => {
  const eyes = { left: { x: 300, y: 400 }, right: { x: 500, y: 420 }, source: "manual" as const };
  const first = { x: 0, y: 0, width: 1000, height: 1000 };
  const shifted = { ...first, y: 100 };
  const a = eyeMeasurements(eyes, first, 50.8), b = eyeMeasurements(eyes, shifted, 50.8);
  assert.ok(Math.abs(a.averageMm - 29.972) < 1e-9);
  assert.ok(Math.abs(b.averageMm - a.averageMm - 5.08) < 1e-9);
  assert.ok(a.tiltDegrees > 0);
  assert.equal(eyesWithinTarget(eyes, first, 50.8, { minMm: 29, maxMm: 31 }), true);
  assert.equal(eyesWithinTarget(eyes, first, 50.8, { minMm: 30, maxMm: 31 }), false);
  assert.equal(validEyeTarget({ minMm: 31, maxMm: 30 }, 50.8), false);
  assert.equal(validEyeTarget({ minMm: 0, maxMm: 51 }, 50.8), false);
  assert.equal(validEyeTarget({ minMm: NaN, maxMm: 30 }, 50.8), false);
  assert.equal(validEyeTarget({ minMm: -1, maxMm: 30 }, 50.8), false);
  assert.equal(validEyeTarget({ minMm: 30, maxMm: 30 }, 50.8), false);
  assert.equal(eyesWithinTarget(eyes, { ...first, x: 350 }, 50.8, { minMm: 0, maxMm: 50 }), false);
});

test("neutral lighting is exact identity, preserves alpha and does not mutate the input", () => {
  const input = Uint8ClampedArray.from({ length: 1024 }, (_, i) => i % 256);
  const copy = input.slice();
  const result = applyTonePixels(input, DEFAULT_TONE);
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.deepEqual(input, copy);
  assert.equal(hasTone(DEFAULT_TONE), false);
  assert.equal(hasTone(GENTLE_LIFT), true);
});

test("exposure operates in linear light and gentle lift visibly brightens dark pixels", () => {
  const input = new Uint8ClampedArray([64, 64, 64, 127, 40, 32, 24, 255]);
  const result = applyTonePixels(input, { ...DEFAULT_TONE, exposure: 1 });
  assert.ok(Math.abs(result[0] - 90) <= 1);
  const gentle = applyTonePixels(input, GENTLE_LIFT);
  assert.ok(gentle[4] >= input[4] + 15);
  assert.ok(gentle[5] >= input[5] + 10);
  assert.ok(gentle[6] >= input[6] + 8);
  assert.equal(gentle[3], 127);
  assert.equal(gentle[7], 255);
  assert.deepEqual(input, new Uint8ClampedArray([64, 64, 64, 127, 40, 32, 24, 255]));
});

test("shadow lift targets dark regions and highlight reduction targets bright regions", () => {
  const input = new Uint8ClampedArray([40, 40, 40, 255, 240, 240, 240, 255]);
  const shadows = applyTonePixels(input, { ...DEFAULT_TONE, shadows: 30 });
  assert.ok(Math.abs(shadows[0] - 65) <= 1);
  assert.ok(Math.abs(shadows[4] - 240) <= 1);
  const highlights = applyTonePixels(input, { ...DEFAULT_TONE, highlights: 50 });
  assert.ok(Math.abs(highlights[0] - 40) <= 1);
  assert.ok(highlights[4] < 225);
});

test("all supported control extremes produce bounded finite pixels and preserve alpha", () => {
  const input = Uint8ClampedArray.from({ length: 1024 }, (_, i) => (i * 79) % 256);
  for (const exposure of [-1, 1.5]) for (const shadows of [0, 40])
    for (const highlights of [0, 50]) for (const contrast of [-20, 20]) {
      const output = applyTonePixels(input, { exposure, shadows, highlights, contrast });
      assert.ok(output.every(value => Number.isFinite(value) && value >= 0 && value <= 255));
      for (let i = 3; i < input.length; i += 4) assert.equal(output[i], input[i]);
    }
});

test("highlight-off adjustments preserve the previous pixel outputs exactly", () => {
  const input = new Uint8ClampedArray([40, 30, 20, 127, 128, 128, 128, 255, 185, 130, 87, 255, 240, 240, 240, 255, 255, 180, 90, 255, 0, 0, 0, 255]);
  for (const [settings, expected] of [
    [GENTLE_LIFT, [62, 48, 34, 127, 146, 146, 146, 255, 210, 148, 99, 255, 255, 255, 255, 255, 255, 180, 90, 255, 32, 32, 32, 255]],
    [{ ...DEFAULT_TONE, exposure: 1.5, shadows: 40, contrast: 20 }, [88, 69, 50, 127, 219, 219, 219, 255, 255, 181, 123, 255, 255, 255, 255, 255, 255, 180, 90, 255, 40, 40, 40, 255]],
    [{ ...DEFAULT_TONE, exposure: -1, shadows: 40, contrast: -20 }, [95, 75, 55, 127, 100, 100, 100, 255, 140, 97, 64, 255, 167, 167, 167, 255, 182, 127, 62, 255, 77, 77, 77, 255]],
  ] as const) assert.deepEqual([...applyTonePixels(input, settings)], [...expected]);
});

test("highlight reduction is measurable in upper midtones and works with raised exposure and contrast", () => {
  const gray = (value: number, highlights: number, exposure = 0, contrast = 0) =>
    applyTonePixels(new Uint8ClampedArray([value, value, value, 255]), { ...DEFAULT_TONE, highlights, exposure, contrast })[0];
  for (const value of [0, 40, 100, 128, 140]) assert.equal(gray(value, 50), value);
  assert.ok(gray(200, 50) <= 190);
  assert.ok(gray(240, 50) <= 210);
  for (const exposure of [0, 0.4, 1, 1.5]) for (const contrast of [-20, 0, 20]) {
    const base = gray(240, 0, exposure, contrast);
    const middle = gray(240, 25, exposure, contrast);
    const full = gray(240, 50, exposure, contrast);
    assert.ok(base - middle >= 6, `Mid-slider strength is too weak at exposure ${exposure}, contrast ${contrast}`);
    assert.ok(base - full >= 15);
    assert.ok(full < middle && middle < base);
    assert.ok(gray(220, 50, exposure, contrast) < full);
    assert.ok(full < gray(255, 50, exposure, contrast));
  }
});

test("highlight compression is monotonic across the full ramp and every slider position", () => {
  const input = Uint8ClampedArray.from({ length: 256 * 4 }, (_, i) => i % 4 === 3 ? 127 : Math.floor(i / 4));
  const original = input.slice();
  for (const exposure of [-1, 0, 0.4, 1, 1.5]) for (const contrast of [-20, 0, 20]) for (const shadows of [0, 40]) {
    let previous: Uint8ClampedArray | undefined;
    for (let highlights = 0; highlights <= 50; highlights++) {
      const output = applyTonePixels(input, { exposure, shadows, highlights, contrast });
      for (let i = 0; i < output.length; i += 4) {
        if (i) assert.ok(output[i] >= output[i - 4], "Increasing input brightness must not reverse output brightness.");
        if (previous) assert.ok(output[i] <= previous[i], "Increasing reduction must not brighten a pixel.");
        assert.equal(output[i + 1], output[i]);
        assert.equal(output[i + 2], output[i]);
        assert.equal(output[i + 3], 127);
      }
      previous = output;
    }
  }
  assert.deepEqual(input, original);
});

test("highlight compression preserves linear color ratios without inventing clipped source detail", () => {
  const linear = (value: number) => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4;
  for (const rgb of [[240, 180, 100], [100, 190, 250], [255, 120, 80]]) {
    const input = new Uint8ClampedArray([...rgb, 191]);
    for (const highlights of [25, 50]) {
      const output = applyTonePixels(input, { ...DEFAULT_TONE, exposure: 1.5, contrast: 20, highlights });
      const inputPeak = Math.max(...rgb.map(linear));
      const outputPeak = Math.max(...[...output.slice(0, 3)].map(linear));
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(linear(output[c]) / outputPeak - linear(rgb[c]) / inputPeak) < 0.012);
      assert.equal(output[3], 191);
      assert.ok(Math.max(...output.slice(0, 3)) < 255);
    }
  }
  const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
  const result = applyTonePixels(white, { ...DEFAULT_TONE, exposure: 1.5, highlights: 50 });
  assert.deepEqual(result.slice(0, 4), result.slice(4, 8));
});

test("invalid lighting settings and malformed pixel buffers fail explicitly", () => {
  for (const settings of [
    { ...DEFAULT_TONE, exposure: NaN }, { ...DEFAULT_TONE, exposure: Infinity },
    { ...DEFAULT_TONE, exposure: 2.6 }, { ...DEFAULT_TONE, shadows: -1 },
    { ...DEFAULT_TONE, highlights: 51 }, { ...DEFAULT_TONE, contrast: -21 },
  ]) assert.throws(() => applyTonePixels(new Uint8ClampedArray(4), settings), /supported range/);
  assert.throws(() => applyTonePixels(new Uint8ClampedArray(3), DEFAULT_TONE), /RGBA/);
  // A dark, underexposed face (sRGB 88, 58, 37) needs the extended range to reach a moderate brightness.
  const darkFace = new Uint8ClampedArray([88, 58, 37, 255]);
  const brightest = applyTonePixels(darkFace, { ...DEFAULT_TONE, exposure: 2.5 });
  const previousMax = applyTonePixels(darkFace, { ...DEFAULT_TONE, exposure: 1.5 });
  assert.deepEqual([...brightest], [196, 134, 91, 255], "+2.5 EV brightens without clipping");
  assert.ok(brightest[0] - previousMax[0] > 40, "extended exposure is materially brighter than the former +1.5 EV limit");
  assert.ok(Math.abs(brightest[0] / brightest[1] - previousMax[0] / previousMax[1]) < 0.05, "hue ratios are preserved");
});

test("filenames distinguish original, lighting, background and combined edits", () => {
  assert.equal(editSuffix({ background: false, lighting: false }), "-original-based");
  assert.equal(editSuffix({ background: false, lighting: true }), "-lighting-edited");
  assert.equal(editSuffix({ background: true, lighting: false }), "-background-edited");
  assert.equal(editSuffix({ background: true, lighting: true }), "-lighting-and-background-edited");
  assert.equal(editSuffix({ background: false, lighting: false, straightened: false }), "-original-based");
  assert.equal(editSuffix({ background: false, lighting: false, straightened: true }), "-head-straightened-edited");
  assert.equal(editSuffix({ background: true, lighting: true, straightened: true }), "-head-straightened-and-lighting-and-background-edited");
});

test("head straightening rotates the head rigidly, fades smoothly, never folds and leaves distant pixels unchanged", () => {
  for (const [width, height, head] of [
    [1800, 2200, { x: 600, y: 300, width: 600, height: 720 }],
    [1024, 768, { x: 410, y: 281, width: 187, height: 224 }],
    [4000, 3000, { x: 1500, y: 600, width: 900, height: 1100 }],
  ] as const) for (const degrees of [-10, -6.95, 0.5, 4, 10]) {
    const a = degrees * Math.PI / 180, cx = head.x + head.width / 2, ey = head.y + head.height * 0.42, half = head.width * 0.18;
    const eyes = { left: { x: cx - half * Math.cos(a), y: ey - half * Math.sin(a) }, right: { x: cx + half * Math.cos(a), y: ey + half * Math.sin(a) }, source: "detected" as const };
    assert.ok(Math.abs(eyeLineDegrees(eyes) - degrees) < 1e-9);
    const g = straightening(width, height, head, eyes, degrees);
    assert.equal(g.width, width); assert.equal(g.height, height);
    // The pivot sits on the face midline, below the eyes at the estimated chin.
    const mid = { x: cx, y: ey };
    assert.ok(Math.abs(Math.atan2(g.pivot.x - mid.x, g.pivot.y - mid.y) + a) < 1e-9);
    // Eyes lie inside the rigid zone: exactly level afterwards, with unchanged spacing.
    const level = mapEyes(eyes, p => toStraightened(p, g));
    assert.ok(Math.abs(eyeLineDegrees(level)) < 1e-6);
    assert.ok(Math.abs(Math.hypot(level.right.x - level.left.x, level.right.y - level.left.y) - 2 * half) < 1e-6);
    for (const p of [eyes.left, eyes.right]) assert.equal(straightenWeight(toStraightened(p, g), g), 1);
    // Outside the bounds nothing moves; image corners and lower shoulders stay put.
    const bounds = straightenBounds(g);
    for (const p of [{ x: 0, y: 0 }, { x: width - 1, y: height - 1 }, { x: 1, y: height - 2 }, { x: cx, y: Math.min(height - 1, head.y + head.height * 2.2) }]) {
      if (p.x >= bounds.x && p.x < bounds.x + bounds.width && p.y >= bounds.y && p.y < bounds.y + bounds.height) continue;
      assert.equal(straightenWeight(p, g), 0); assert.deepEqual(fromStraightened(p, g), p);
    }
    // Weight is continuous and the inverse map is locally invertible (positive Jacobian) everywhere in the fade zone.
    const step = Math.max(2, Math.round(Math.min(bounds.width, bounds.height) / 70)), h = 0.25;
    let previous: number | null = null;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += step) for (let x = bounds.x; x < bounds.x + bounds.width; x += step) {
      const q = { x: x + 0.5, y: y + 0.5 };
      const sx = fromStraightened({ x: q.x + h, y: q.y }, g), sx0 = fromStraightened({ x: q.x - h, y: q.y }, g);
      const sy = fromStraightened({ x: q.x, y: q.y + h }, g), sy0 = fromStraightened({ x: q.x, y: q.y - h }, g);
      const det = ((sx.x - sx0.x) * (sy.y - sy0.y) - (sy.x - sy0.x) * (sx.y - sx0.y)) / (4 * h * h);
      assert.ok(det > 0.2, `fold at ${x},${y} for ${degrees} degrees: ${det}`);
      const w = straightenWeight(q, g);
      if (previous !== null && x !== bounds.x) assert.ok(Math.abs(w - previous) < 0.25);
      previous = w;
      const back = toStraightened(fromStraightened(q, g), g);
      assert.ok(Math.hypot(back.x - q.x, back.y - q.y) < 1e-6);
    }
  }
  const eyes = { left: { x: 800, y: 600 }, right: { x: 1000, y: 600 }, source: "manual" as const };
  for (const degrees of [10.01, -11, Number.NaN, Infinity]) {
    assert.equal(validStraightenDegrees(degrees), false);
    assert.throws(() => straightening(1800, 2200, { x: 600, y: 300, width: 600, height: 720 }, eyes, degrees), /limited to 10 degrees/);
  }
  assert.throws(() => straightening(1800, 2200, { x: 600, y: 300, width: 0, height: 720 }, eyes, 5), /Select or mark the head/);
  assert.throws(() => straightening(1800, 2200, { x: 600, y: 300, width: 600, height: 720 }, { ...eyes, right: eyes.left }, 5), /distinct eye/);
  assert.equal(MAX_STRAIGHTEN_DEGREES, 10);
});

test("pose heuristics flag turned and raised/lowered faces independently of in-plane tilt", () => {
  const frontal = { leftEye: { x: 400, y: 400 }, rightEye: { x: 500, y: 400 }, nose: { x: 450, y: 455 }, mouth: { x: 450, y: 500 },
    leftEar: { x: 330, y: 420 }, rightEar: { x: 570, y: 420 } };
  const level = estimatePose(frontal)!;
  assert.equal(level.turned, false); assert.equal(level.pitched, null);
  assert.ok(Math.abs(level.rollDegrees) < 1e-9 && Math.abs(level.noseOffset) < 1e-9 && Math.abs(level.earBalance - 1) < 1e-9);
  assert.ok(Math.abs(level.pitchRatio - 0.55) < 1e-9);
  const rotate = (points: typeof frontal, degrees: number) => {
    const a = degrees * Math.PI / 180;
    return Object.fromEntries(Object.entries(points).map(([key, p]) => [key, {
      x: 450 + (p.x - 450) * Math.cos(a) - (p.y - 450) * Math.sin(a), y: 450 + (p.x - 450) * Math.sin(a) + (p.y - 450) * Math.cos(a),
    }])) as typeof frontal;
  };
  const tilted = estimatePose(rotate(frontal, 8))!;
  assert.ok(Math.abs(tilted.rollDegrees - 8) < 1e-9);
  assert.equal(tilted.turned, false); assert.equal(tilted.pitched, null);
  assert.ok(Math.abs(tilted.pitchRatio - level.pitchRatio) < 1e-9);
  const turned = estimatePose({ ...frontal, nose: { x: 470, y: 455 }, rightEar: { x: 520, y: 420 } })!;
  assert.equal(turned.turned, true);
  assert.equal(estimatePose({ ...frontal, nose: { x: 450 + POSE_LIMITS.noseOffset * 100 - 1, y: 455 } })!.turned, false);
  assert.equal(estimatePose({ ...frontal, rightEar: { x: 530, y: 420 } })!.turned, true);
  assert.equal(estimatePose({ ...frontal, nose: { x: 450, y: 430 } })!.pitched, "up");
  assert.equal(estimatePose({ ...frontal, nose: { x: 450, y: 485 } })!.pitched, "down");
  assert.equal(estimatePose({ ...frontal, rightEye: { x: 400, y: 400 } }), null);
  assert.equal(estimatePose({ ...frontal, mouth: { x: 450, y: 380 } }), null);
  assert.equal(estimatePose({ ...frontal, nose: { x: Number.NaN, y: 455 } }), null);
});

test("square and portal crops retain aspect ratio and remain in original bounds", () => {
  for (const [width, height] of [[3000, 4000], [4000, 3000], [600, 600]]) {
    for (const ratio of [1, 7 / 9]) {
      for (const frame of [INITIAL_FRAME, { zoom: 3, x: 0, y: 100 }, { zoom: 1.7, x: 100, y: 0 }]) {
        const rect = cropRect(width, height, ratio, frame);
        assert.ok(Math.abs(rect.width / rect.height - ratio) < 1e-9);
        assert.ok(rect.x >= 0 && rect.y >= 0);
        assert.ok(rect.x + rect.width <= width + 1e-8 && rect.y + rect.height <= height + 1e-8);
      }
    }
  }
});

test("invalid crop settings fail explicitly", () => {
  assert.throws(() => cropRect(100, 100, 1, { zoom: 0, x: 50, y: 50 }));
  assert.throws(() => cropRect(100, 100, 1, { zoom: 1, x: -1, y: 50 }));
  assert.throws(() => cropRect(NaN, 100, 1, INITIAL_FRAME));
});

test("actual crop resolution, not full image size, controls print eligibility", () => {
  const crop = cropRect(2000, 3000, 1, { zoom: 2, x: 50, y: 50 });
  assert.equal(sufficientResolution(crop, 1200, 1200), false);
  assert.equal(sufficientResolution(crop, 600, 600), true);
  assert.equal(sufficientResolution({ x: 0, y: 0, width: 629, height: 810 }, 630, 810), false);
});

test("head ruler enforces the measured 1 to 1.375 inch interval", () => {
  assert.equal(headSizeInches(20, 80), 1.2);
  assert.equal(validHeadSize(20, 70), true);
  assert.equal(validHeadSize(10, 78.75), true);
  assert.equal(validHeadSize(20, 69), false);
  assert.equal(validHeadSize(10, 79), false);
});

test("standard sheets have exact size, separate print rectangles and guides entirely in waste paper", () => {
  for (const ppi of [300, 600] as const) for (const preset of ["5x7", "4x6"] as const) for (const format of ["2x2", "35x45"] as const) {
    const layout = sheetLayout(ppi, preset, format), spec = SHEET_PRESETS[preset], photoSpec = PRINT_FORMATS[format];
    assert.equal(layout.width / ppi, spec.width); assert.equal(layout.height / ppi, spec.height);
    assert.equal(layout.photos.length, (format === "35x45" ? 2 : spec.columns) * spec.rows);
    for (let i = 0; i < layout.photos.length; i++) {
      const a = layout.photos[i];
      assert.ok(Math.abs(a.width / ppi * 25.4 - photoSpec.widthMm) <= 12.7 / ppi + 1e-9);
      assert.ok(Math.abs(a.height / ppi * 25.4 - photoSpec.heightMm) <= 12.7 / ppi + 1e-9);
      assert.ok(Number.isInteger(a.x) && Number.isInteger(a.y));
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.width && a.y + a.height <= layout.height);
      for (const b of layout.photos.slice(i + 1)) {
        const gap = 0.25 * ppi;
        assert.ok(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
      }
    }
    const columns = format === "35x45" ? 2 : spec.columns;
    assert.equal(layout.guides.length, columns * 2 + spec.rows * 2);
    assert.equal(layout.guideWidth / ppi, 0.01);
    assert.deepEqual(layout.guideDash.map(value => value / ppi), [0.04, 0.03]);
    for (const guide of layout.guides) {
      const half = layout.guideWidth / 2;
      const left = Math.min(guide.x1, guide.x2) - (guide.x1 === guide.x2 ? half : 0);
      const right = Math.max(guide.x1, guide.x2) + (guide.x1 === guide.x2 ? half : 0);
      const top = Math.min(guide.y1, guide.y2) - (guide.y1 === guide.y2 ? half : 0);
      const bottom = Math.max(guide.y1, guide.y2) + (guide.y1 === guide.y2 ? half : 0);
      assert.ok(left >= 0 && top >= 0 && right <= layout.width && bottom <= layout.height);
      if (guide.x1 === guide.x2) assert.ok(top === 0 && bottom === layout.height);
      else assert.ok(left === 0 && right === layout.width);
      for (const photo of layout.photos) {
        assert.ok(right <= photo.x || left >= photo.x + photo.width || bottom <= photo.y || top >= photo.y + photo.height);
      }
      assert.ok(layout.photos.some(photo => guide.x1 === guide.x2 ?
        right === photo.x || left === photo.x + photo.width :
        bottom === photo.y || top === photo.y + photo.height));
    }
    for (const photo of layout.photos) {
      const vertical = layout.guides.filter(g => g.x1 === g.x2), horizontal = layout.guides.filter(g => g.y1 === g.y2);
      assert.ok(vertical.some(g => g.x1 + layout.guideWidth / 2 === photo.x));
      assert.ok(vertical.some(g => g.x1 - layout.guideWidth / 2 === photo.x + photo.width));
      assert.ok(horizontal.some(g => g.y1 + layout.guideWidth / 2 === photo.y));
      assert.ok(horizontal.some(g => g.y1 - layout.guideWidth / 2 === photo.y + photo.height));
    }
  }
});

test("sheet selector supports only the two standard sizes", () => {
  assert.equal(isSheetPreset("5x7"), true);
  assert.equal(isSheetPreset("4x6"), true);
  for (const value of ["six", "safe", "4x7-six", "__proto__", "unknown"]) assert.equal(isSheetPreset(value), false);
});

test("metric prints use nearest-pixel dimensions and independently framed proportional crops", () => {
  assert.deepEqual(printDimensions("35x45", 300), { width: 413, height: 531 });
  assert.deepEqual(printDimensions("35x45", 600), { width: 827, height: 1063 });
  for (const ppi of [300, 600] as const) {
    const pixels = printDimensions("35x45", ppi);
    const rect = cropRect(1800, 2200, pixels.width / pixels.height, INITIAL_FRAME);
    assert.ok(Math.abs(rect.width / rect.height - pixels.width / pixels.height) < 1e-12);
    assert.equal(sufficientResolution(rect, pixels.width, pixels.height), true);
  }
  const suggestion = suggestFraming(1000, 1400, null, "35x45");
  assert.equal(suggestion.ppi, 600);
  assert.equal(suggestFraming(600, 800, null, "35x45").ppi, 300);
  assert.equal(validPrintHead(10, 90, "35x45"), true);
  assert.equal(validPrintHead(10, 90, "2x2"), false);
  for (const [top, chin] of [[50, 50], [80, 30], [-1, 90], [10, 101], [NaN, 80]]) {
    assert.equal(validPrintHead(top, chin, "35x45"), false);
  }
});

test("portal defaults expand minor native-resolution shortfalls without upscaling or changing print framing", () => {
  const face = {
    bounds: { x: 900, y: 500, width: 350, height: 420 },
    head: { x: 850, y: 400, width: 430, height: 640 },
    confidence: 1, source: "manual" as const,
  };
  const original = frameAroundHead(2400, 1800, face.head, 7 / 9, 0.80, 0.05);
  const before = cropRect(2400, 1800, 7 / 9, original);
  assert.equal(sufficientResolution(before, 630, 810), false);
  const defaults = suggestFraming(2400, 1800, face);
  const after = cropRect(2400, 1800, 7 / 9, defaults.portal);
  assert.equal(sufficientResolution(after, 630, 810), true);
  assert.ok(after.height / before.height <= 1.10);
  assert.ok(after.x >= 0 && after.y >= 0 && after.x + after.width <= 2400 && after.y + after.height <= 1800);
  assert.ok(Math.abs((after.x + after.width / 2) - (face.head.x + face.head.width / 2)) < 1e-9);
  assert.deepEqual(defaults.print, frameAroundHead(2400, 1800, face.head, 1, 0.60, 0.16));
  assert.equal(defaults.ppi, 300);
});

test("portal defaults do not hide major framing shortfalls or invent source resolution", () => {
  const face = {
    bounds: { x: 400, y: 300, width: 180, height: 240 },
    head: { x: 380, y: 250, width: 220, height: 300 },
    confidence: 1, source: "manual" as const,
  };
  const defaults = suggestFraming(2400, 1800, face);
  assert.deepEqual(defaults.portal, frameAroundHead(2400, 1800, face.head, 7 / 9, 0.80, 0.05));
  assert.equal(sufficientResolution(cropRect(2400, 1800, 7 / 9, defaults.portal), 630, 810), false);
  const small = suggestFraming(600, 780, null);
  assert.equal(sufficientResolution(cropRect(600, 780, 7 / 9, small.portal), 630, 810), false);
});

test("size guards reject oversized and invalid images", () => {
  assert.equal(dimensionsAllowed(6000, 4000), true);
  assert.equal(dimensionsAllowed(6001, 4000), false);
  assert.equal(dimensionsAllowed(10001, 1), false);
  assert.equal(dimensionsAllowed(0, 100), false);
});

test("PNG signature and dimensions are validated before decoding", () => {
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(png.buffer);
  view.setUint32(16, 630); view.setUint32(20, 810);
  assert.deepEqual(readHeader(png), { format: "png", width: 630, height: 810 });
  png[12] = 0;
  assert.throws(() => readHeader(png), /invalid/);
  assert.throws(() => readHeader(new TextEncoder().encode("<svg/>")), /JPEG, PNG/);
});

const bareJpeg = new Uint8Array([255, 216, 255, 192, 0, 17, 8, 3, 42, 2, 118, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 217]);

test("JPEG dimensions and truncated segments are handled explicitly", () => {
  assert.deepEqual(readHeader(bareJpeg), { format: "jpeg", width: 630, height: 810 });
  assert.throws(() => readHeader(bareJpeg.subarray(0, 10)), /truncated/);
});

test("JPEG density is inserted and updated without changing encoded content", () => {
  const inserted = setJpegDensity(bareJpeg, 600);
  assert.equal(inserted[13], 1);
  assert.equal(inserted[14] * 256 + inserted[15], 600);
  assert.equal(inserted[16] * 256 + inserted[17], 600);
  assert.deepEqual(readHeader(inserted), readHeader(bareJpeg));
  const updated = setJpegDensity(inserted, 300);
  assert.equal(updated.length, inserted.length);
  assert.equal(updated[14] * 256 + updated[15], 300);
  assert.equal(inserted[14] * 256 + inserted[15], 600);
});

test("portal encoding target is strictly below decimal 250 KB", () => {
  assert.equal(PORTAL_LIMIT, 250_000);
  assert.ok(PORTAL_TARGET < PORTAL_LIMIT);
});

function drawing(width = 20, height = 20) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const middle = x >= width / 4 && x < width * 3 / 4 && y >= height / 4 && y < height * 3 / 4;
      const i = (y * width + x) * 4;
      pixels.set(middle ? [45, 70, 55, 255] : [230, 230, 230, 255], i);
    }
  }
  return pixels;
}

test("background mask selects the border but preserves contrasting center pixels", () => {
  const mask = backgroundMask(drawing(), 20, 20, 15);
  assert.equal(mask[3], 255);
  assert.equal(mask[(10 * 20 + 10) * 4 + 3], 0);
});

test("background edit rejects inconsistent corners and overbroad selections", () => {
  const pixels = drawing();
  pixels.set([0, 0, 0, 255], 0);
  assert.throws(() => backgroundMask(pixels, 20, 20, 10), /corners/);
  const blank = new Uint8ClampedArray(20 * 20 * 4).fill(255);
  assert.throws(() => backgroundMask(blank, 20, 20, 10), /too small or too broad/);
});

test("quality analysis returns finite advisories and does not create face-compliance labels", () => {
  const metrics = analyzePixels(drawing(), 20, 20);
  assert.ok(Object.values(metrics).every(Number.isFinite));
  assert.ok(metrics.backgroundBrightness > 220);
  assert.equal(metrics.backgroundSpread, 0);
  assert.equal("facePassed" in metrics, false);
  assert.throws(() => analyzePixels(new Uint8ClampedArray(4), 1, 1), /too small/);
});

test("face-aware defaults center an off-center head, meet print head ratio, and preserve both aspect ratios", () => {
  const face = { bounds: { x: 1900, y: 700, width: 650, height: 700 }, head: { x: 1850, y: 480, width: 750, height: 950 }, confidence: 0.95, source: "detected" as const };
  const defaults = suggestFraming(3600, 4000, face);
  const print = cropRect(3600, 4000, 1, defaults.print);
  const portal = cropRect(3600, 4000, 7 / 9, defaults.portal);
  assert.ok(Math.abs(print.x + print.width / 2 - (face.head.x + face.head.width / 2)) < 1);
  assert.ok(Math.abs(headSizeInches(defaults.guides.top, defaults.guides.chin) - 1.2) < 1e-6);
  assert.ok(validHeadSize(defaults.guides.top, defaults.guides.chin));
  assert.ok(Math.abs(portal.width / portal.height - 7 / 9) < 1e-8);
  assert.equal(defaults.ppi, 600);
});

test("face defaults stay inside image, estimate hair above face box and select achievable PPI", () => {
  const bounds = { x: 0, y: 10, width: 180, height: 200 };
  const head = estimatedHead(bounds, 900, 1200);
  assert.equal(head.y, 0);
  const defaults = suggestFraming(900, 1200, { bounds, head, confidence: 0.8, source: "detected" });
  const crop = cropRect(900, 1200, 1, defaults.print);
  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.equal(defaults.ppi, 300);
  assert.deepEqual(suggestFraming(1600, 2000, null).print, INITIAL_FRAME);
});

test("crop adjustment keeps head guides anchored to the same source points", () => {
  const oldRect = { x: 100, y: 200, width: 1000, height: 1000 };
  const nextRect = { x: 200, y: 300, width: 800, height: 800 };
  const guides = reprojectGuides(oldRect, nextRect, { top: 20, chin: 80 });
  assert.equal(nextRect.y + nextRect.height * guides.top / 100, 400);
  assert.equal(nextRect.y + nextRect.height * guides.chin / 100, 1000);
});

test("background replacement removes the old wall color from soft edges and never adds foreground", () => {
  const toLinear = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const toSrgb = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  // A 40 x 8 strip: blue shirt on the left, lavender-gray wall on the right, with a soft 8-pixel transition.
  const width = 40, height = 8, wall = [160, 155, 170], shirt = [30, 40, 140];
  const alpha = new Float32Array(width * height), data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = Math.max(0, Math.min(1, (24 - x) / 8)), i = y * width + x;
    alpha[i] = a;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = toSrgb(a * toLinear(shirt[c]) + (1 - a) * toLinear(wall[c]));
    data[i * 4 + 3] = 255;
  }
  const field = estimateColorField(data, alpha, width, height);
  const out = data.slice();
  compositeEdgePixels(out, width, height, alpha, field, [255, 255, 255]);
  for (let x = 0; x < width; x++) {
    const i = (4 * width + x) * 4, a = alpha[4 * width + x];
    if (a >= 0.999) assert.deepEqual([...out.slice(i, i + 3)], [...data.slice(i, i + 3)]);
    else if (a <= 0.001) assert.deepEqual([...out.slice(i, i + 4)], [255, 255, 255, 255]);
    else {
      // Expected: the shirt blended with white, with no lavender-gray wall contribution left behind.
      const expected = shirt.map(v => toSrgb(a * toLinear(v) + (1 - a)));
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(out[i + c] - expected[c]) <= 3, `x=${x} c=${c}: ${out[i + c]} vs ${expected[c]}`);
    }
  }
  // Mask overreach: a pure-wall pixel the mask wrongly marks as 30% person becomes the new background color.
  const halo = alpha.slice(); const haloIndex = 4 * width + 30; halo[haloIndex] = 0.3;
  const haloOut = data.slice();
  compositeEdgePixels(haloOut, width, height, halo, field, [255, 255, 255]);
  for (let c = 0; c < 3; c++) assert.ok(haloOut[haloIndex * 4 + c] >= 252);
  // Low-contrast person/wall colors (light shirt on a light wall) keep the mask alpha instead of being erased.
  const lightShirt = 234, lightWall = 230;
  const light = new Uint8ClampedArray(data.length);
  for (let i = 0; i < width * height; i++) {
    const v = toSrgb(alpha[i] * toLinear(lightShirt) + (1 - alpha[i]) * toLinear(lightWall));
    light.set([v, v, v, 255], i * 4);
  }
  const lightOut = light.slice();
  compositeEdgePixels(lightOut, width, height, alpha, estimateColorField(light, alpha, width, height), [255, 255, 255]);
  const edge = 4 * width + 18, edgeAlpha = alpha[edge];
  assert.ok(Math.abs(lightOut[edge * 4] - toSrgb(edgeAlpha * toLinear(lightShirt) + (1 - edgeAlpha))) <= 3, "light foreground at the edge must remain visible");
  // Selected light colors are applied exactly where there is no person.
  const neutral = data.slice();
  compositeEdgePixels(neutral, width, height, alpha, field, BACKGROUND_COLORS.neutral.rgb);
  assert.deepEqual([...neutral.slice((4 * width + 39) * 4, (4 * width + 39) * 4 + 4)], [245, 245, 245, 255]);
  assert.throws(() => compositeEdgePixels(data.slice(4), width, height, alpha, field, [255, 255, 255]), /mismatched/);
});

test("matting preserves soft hair alpha and solid foreground instead of matching foreground colors", () => {
  assert.equal(adjustedAlpha(1, DEFAULT_MATTE), 1);
  assert.equal(adjustedAlpha(0.01, DEFAULT_MATTE), 0);
  assert.ok(adjustedAlpha(0.5, DEFAULT_MATTE) > 0.4 && adjustedAlpha(0.5, DEFAULT_MATTE) < 0.6);
  assert.equal(adjustedAlpha(0.5, { cleanup: 0, softness: 0 }), 1);
  assert.throws(() => adjustedAlpha(NaN, DEFAULT_MATTE), /Invalid/);
});
