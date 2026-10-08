import type { Landmark } from "../types/pose";

export const BODY_SIDES = [
  { name: "left", shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31, ear: 7 },
  { name: "right", shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32, ear: 8 },
] as const;
export type BodySide = typeof BODY_SIDES[number];
export const sideJoints = (s: BodySide) => [s.shoulder, s.elbow, s.wrist, s.hip, s.knee, s.ankle, s.heel, s.toe];
export const reliablePoint = (p: Landmark | undefined) => !!p && p.visibility >= 0.6 && [p.x,p.y,p.z].every(Number.isFinite);
const contained = (p: Landmark) => p.x >= 0.04 && p.x <= 0.96 && p.y >= 0.04 && p.y <= 0.96;

/** Require a complete observed chain; never assemble a body from alternating hidden limbs. */
export function visibleSide(points: Landmark[]): BodySide | undefined {
  return BODY_SIDES.filter(side => sideJoints(side).every(i => reliablePoint(points[i])))
    .sort((a,b) => Math.min(...sideJoints(b).map(i=>points[i].visibility)) - Math.min(...sideJoints(a).map(i=>points[i].visibility)))[0];
}

export function checkSideInFrame(points: Landmark[]): { inFrame: boolean; message: string } {
  const side = points.length >= 33 ? visibleSide(points) : undefined;
  if (!side) return { inFrame: false, message: "Keep the camera-facing arm, hip, knee and entire foot visible in good light" };
  if (![0,side.ear].some(i => reliablePoint(points[i]) && contained(points[i]))) {
    return { inFrame: false, message: "Keep your head inside the camera view" };
  }
  // Hidden far-side joints are expected in profile. Visible clipped joints still block credit.
  if (!sideJoints(side).every(i => contained(points[i])) || points.some(p => reliablePoint(p) && !contained(p))) {
    return { inFrame: false, message: "Step back so your head, raised hands and feet fit inside the view" };
  }
  return { inFrame: true, message: "Side view visible — stay in frame" };
}
