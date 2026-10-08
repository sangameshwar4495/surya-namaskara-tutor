import type { Landmark } from "../types/pose";

/** Interior angle ABC in degrees, using metric world coordinates. */
export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number | null {
  const ba = [a.x - b.x, a.y - b.y, a.z - b.z];
  const bc = [c.x - b.x, c.y - b.y, c.z - b.z];
  if (![...ba, ...bc].every(Number.isFinite)) return null;
  const lengthBA = Math.hypot(...ba);
  const lengthBC = Math.hypot(...bc);
  if (lengthBA < 1e-6 || lengthBC < 1e-6) return null;
  const cosine = ba.reduce((sum, value, i) => sum + (value / lengthBA) * (bc[i] / lengthBC), 0);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}
