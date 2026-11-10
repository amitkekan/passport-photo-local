import type { Eyes, Point } from "./eyes";
import type { Rect } from "./core";

/** Face-detector keypoints in source pixels. Left/right are image sides, not the subject's. */
export type Landmarks = { leftEye: Point; rightEye: Point; nose: Point; mouth: Point; leftEar: Point; rightEar: Point };

export const MAX_STRAIGHTEN_DEGREES = 10;
// Uncalibrated engineering heuristics, chosen wide to limit false alarms. Not government thresholds.
export const POSE_LIMITS = { noseOffset: 0.15, earBalance: 0.45, pitchMin: 0.35, pitchMax: 0.75 } as const;
export function eyeLineDegrees(eyes: Eyes): number {
  return Math.atan2(eyes.right.y - eyes.left.y, eyes.right.x - eyes.left.x) * 180 / Math.PI;
}

export function validStraightenDegrees(degrees: number): boolean {
  return Number.isFinite(degrees) && Math.abs(degrees) <= MAX_STRAIGHTEN_DEGREES;
}

/**
 * Head-only straightening, defined in output (straightened) coordinates. The head and hair inside an ellipse rotate
 * rigidly about the chin; outside it the angle fades smoothly to zero, so the face is not reshaped and pixels beyond
 * the fade zone stay identical. The image size never changes.
 */
export type Straightening = {
  degrees: number; width: number; height: number;
  pivot: Point; center: Point; radiusX: number; radiusUp: number; radiusDown: number;
};
// Normalized ellipse radius where the rotation reaches zero: wider above/beside the head, tighter toward the shoulders.
const FADE_ABOVE = 2, FADE_BELOW = 1.5;

function rotateAbout(point: Point, pivot: Point, degrees: number): Point {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = point.x - pivot.x, dy = point.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

export function straightening(width: number, height: number, head: Rect, eyes: Eyes, degrees: number): Straightening {
  if (!validStraightenDegrees(degrees)) throw new Error(`Straightening is limited to ${MAX_STRAIGHTEN_DEGREES} degrees. Retake the photo with the head level.`);
  if (![head.x, head.y, head.width, head.height].every(Number.isFinite) || head.width <= 0 || head.height <= 0) {
    throw new Error("Select or mark the head before straightening it.");
  }
  const ux = eyes.right.x - eyes.left.x, uy = eyes.right.y - eyes.left.y, spacing = Math.hypot(ux, uy);
  if (!(spacing > 0)) throw new Error("Mark two distinct eye centers before straightening the head.");
  const mid = { x: (eyes.left.x + eyes.right.x) / 2, y: (eyes.left.y + eyes.right.y) / 2 };
  const chinDepth = Math.max(head.y + head.height - mid.y, head.height * 0.25);
  // The chin lies along the face's tilted midline, perpendicular to the eye line.
  const pivot = { x: mid.x - uy / spacing * chinDepth, y: mid.y + ux / spacing * chinDepth };
  const center = rotateAbout({ x: head.x + head.width / 2, y: head.y + head.height / 2 }, pivot, -degrees);
  return {
    degrees, width, height, pivot, center,
    radiusX: head.width * 0.6, radiusUp: head.height * 0.55, radiusDown: Math.max(pivot.y - center.y, head.height * 0.25),
  };
}

export function straightenWeight(q: Point, g: Straightening): number {
  const below = q.y > g.center.y;
  const dx = (q.x - g.center.x) / g.radiusX, dy = (q.y - g.center.y) / (below ? g.radiusDown : g.radiusUp);
  const r = Math.hypot(dx, dy);
  if (r <= 1) return 1;
  const fade = FADE_ABOVE - (FADE_ABOVE - FADE_BELOW) * (below ? (dy / r) ** 2 : 0);
  if (r >= fade) return 0;
  const t = (r - 1) / (fade - 1);
  return 1 - t * t * (3 - 2 * t);
}

/** Inverse warp: the original-photo position sampled for output pixel `q`. */
export function fromStraightened(q: Point, g: Straightening): Point {
  const w = straightenWeight(q, g);
  return w === 0 ? { x: q.x, y: q.y } : rotateAbout(q, g.pivot, g.degrees * w);
}

/** Forward warp of an original-photo point, solved numerically; exact rigid rotation inside the head. */
export function toStraightened(p: Point, g: Straightening): Point {
  let q = rotateAbout(p, g.pivot, -g.degrees * straightenWeight(p, g));
  for (let i = 0; i < 60; i++) {
    const s = fromStraightened(q, g), ex = s.x - p.x, ey = s.y - p.y;
    if (Math.hypot(ex, ey) < 1e-9) break;
    q = { x: q.x - ex, y: q.y - ey };
  }
  return q;
}

/** Output pixels that can differ from the original, clamped to the image. */
export function straightenBounds(g: Straightening): Rect {
  const x0 = Math.max(0, Math.floor(g.center.x - g.radiusX * FADE_ABOVE) - 1);
  const y0 = Math.max(0, Math.floor(g.center.y - g.radiusUp * FADE_ABOVE) - 1);
  const x1 = Math.min(g.width, Math.ceil(g.center.x + g.radiusX * FADE_ABOVE) + 1);
  const y1 = Math.min(g.height, Math.ceil(g.center.y + g.radiusDown * FADE_ABOVE) + 1);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}
export function mapEyes(eyes: Eyes, map: (point: Point) => Point): Eyes {
  const points = [map(eyes.left), map(eyes.right)].sort((a, b) => a.x - b.x);
  return { left: points[0], right: points[1], source: eyes.source };
}

export type PoseEstimate = {
  rollDegrees: number; noseOffset: number; earBalance: number; pitchRatio: number;
  turned: boolean; pitched: "up" | "down" | null;
};

/** Rough head-pose indicators measured along the eye line, so in-plane tilt does not affect turn or pitch. */
export function estimatePose(points: Landmarks): PoseEstimate | null {
  const all = Object.values(points);
  if (!all.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const ux = points.rightEye.x - points.leftEye.x, uy = points.rightEye.y - points.leftEye.y;
  const distance = Math.hypot(ux, uy);
  if (distance <= 0 || ux <= 0) return null;
  const u = { x: ux / distance, y: uy / distance }, v = { x: -u.y, y: u.x };
  const mid = { x: (points.leftEye.x + points.rightEye.x) / 2, y: (points.leftEye.y + points.rightEye.y) / 2 };
  const along = (p: Point, axis: Point, origin: Point = mid) => ((p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y);
  const noseOffset = along(points.nose, u) / distance;
  const leftSpan = Math.max(0, along(points.leftEye, u, points.leftEar));
  const rightSpan = Math.max(0, along(points.rightEar, u, points.rightEye));
  const earBalance = Math.max(leftSpan, rightSpan) > 0 ? Math.min(leftSpan, rightSpan) / Math.max(leftSpan, rightSpan) : 0;
  const mouthDepth = along(points.mouth, v);
  if (mouthDepth <= 0) return null;
  const pitchRatio = along(points.nose, v) / mouthDepth;
  return {
    rollDegrees: Math.atan2(uy, ux) * 180 / Math.PI, noseOffset, earBalance, pitchRatio,
    turned: Math.abs(noseOffset) > POSE_LIMITS.noseOffset || earBalance < POSE_LIMITS.earBalance,
    pitched: pitchRatio < POSE_LIMITS.pitchMin ? "up" : pitchRatio > POSE_LIMITS.pitchMax ? "down" : null,
  };
}
