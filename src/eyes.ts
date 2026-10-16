import type { Rect } from "./core";

export type Point = { x: number; y: number };
export type Eyes = { left: Point; right: Point; source: "detected" | "manual" };
export type EyeTarget = { minMm: number; maxMm: number };

export function eyeMeasurements(eyes: Eyes, crop: Rect, heightMm: number) {
  const points = [eyes.left, eyes.right];
  const inside = points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= crop.x && p.x <= crop.x + crop.width && p.y >= crop.y && p.y <= crop.y + crop.height);
  const heights = points.map(p => (1 - (p.y - crop.y) / crop.height) * heightMm);
  return {
    inside,
    leftMm: heights[0], rightMm: heights[1], averageMm: (heights[0] + heights[1]) / 2,
    tiltDegrees: Math.atan2(eyes.right.y - eyes.left.y, eyes.right.x - eyes.left.x) * 180 / Math.PI,
  };
}

export function validEyeTarget(target: EyeTarget, heightMm: number): boolean {
  return Number.isFinite(target.minMm) && Number.isFinite(target.maxMm) &&
    target.minMm >= 0 && target.minMm < target.maxMm && target.maxMm <= heightMm;
}

export function eyesWithinTarget(eyes: Eyes, crop: Rect, heightMm: number, target: EyeTarget): boolean {
  if (!validEyeTarget(target, heightMm)) return false;
  const value = eyeMeasurements(eyes, crop, heightMm);
  return value.inside && value.leftMm >= target.minMm && value.leftMm <= target.maxMm &&
    value.rightMm >= target.minMm && value.rightMm <= target.maxMm;
}
