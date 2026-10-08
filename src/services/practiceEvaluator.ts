import type { PoseDetectionResult } from "../types/pose";
import { BODY_SIDES, checkSideInFrame, reliablePoint, visibleSide } from "./sideTracking";
import { checkHastaProfile } from "./hastaUttanasana";

export const PRACTICE_POSES = [
  { name: "Prayer Pose", instruction: "Face the camera. Stand tall and bring your hands together at your chest." },
  { name: "Hasta Uttanasana", instruction: "Turn sideways, with your toes pointing right in the preview like the reference. Raise both arms alongside your ears and lift your chest into a comfortable backward arch. Keep your legs long; do not force the depth shown." },
] as const;

export interface Evaluation { ready: boolean; kind: "ready" | "tracking" | "adjusting" | "posture"; message: string }
const correction = (message: string): Evaluation => ({ ready: false, kind: "posture", message });
export const tracking = (message: string): Evaluation => ({ ready: false, kind: "tracking", message });

/** Initial coaching tolerances, to be tuned with real-device recordings. */
export function evaluatePose(result: PoseDetectionResult, poseIndex: number, accepted = false): Evaluation {
  // Hysteresis absorbs boundary jitter, not a different body posture.
  const slack = accepted ? 3 : 0;
  const margin = accepted ? 0.04 : 0;
  if (!PRACTICE_POSES[poseIndex]) return correction("Practice complete");
  if (poseIndex === 1) {
    const framing = checkSideInFrame(result.landmarks);
    if (!framing.inFrame) return tracking(framing.message);
    const p = result.landmarks;
    const side = visibleSide(p)!;
    // Always assess the full camera-facing chain, plus any reliable far-side joint.
    for (const s of BODY_SIDES) {
      const a = result.angles;
      const checks = [
        { indices: [s.hip,s.knee,s.ankle], angle: s.name === "left" ? a.leftKnee : a.rightKnee, min: 155, message: "Keep both legs long without locking your knees" },
        { indices: [s.shoulder,s.hip,s.knee], angle: s.name === "left" ? a.leftHip : a.rightHip, min: 125, message: "Reduce the bend at your hips and lengthen your torso" },
        { indices: [s.elbow,s.shoulder,s.hip], angle: s.name === "left" ? a.leftShoulder : a.rightShoulder, min: 150, message: "Lift both arms alongside your ears" },
        { indices: [s.shoulder,s.elbow,s.wrist], angle: s.name === "left" ? a.leftElbow : a.rightElbow, min: 150, message: "Lengthen both arms overhead" },
      ];
      for (const check of checks) {
        if (s !== side && !check.indices.every(i=>reliablePoint(p[i]))) continue;
        if (check.angle === null || !Number.isFinite(check.angle)) return tracking("Hold your camera-facing side clearly in view for reliable joint measurements");
        if (check.angle < check.min - slack) return correction(check.message);
      }
    }
    const profileMessage = checkHastaProfile(result, accepted);
    if (profileMessage) return correction(profileMessage);
    return { ready: true, kind: "ready", message: "Backward arch detected — hold comfortably and breathe" };
  }
  if (!result.inFrame) return tracking(result.message);
  const p = result.landmarks;
  if (![11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].every(i =>
    p[i] && p[i].visibility >= 0.6 && [p[i].x, p[i].y, p[i].z].every(Number.isFinite) &&
    p[i].x > 0.02 && p[i].x < 0.98 && p[i].y > 0.02 && p[i].y < 0.98)) {
    return tracking("Tracking unclear — keep both hands, arms and legs visible in good light");
  }
  const a = result.angles;
  if (Object.values(a).some(value => value === null || !Number.isFinite(value))) {
    return tracking("Tracking unclear — reposition in good light so your joints are visible");
  }
  const shoulderX = (p[11].x + p[12].x) / 2;
  const shoulderY = (p[11].y + p[12].y) / 2;
  const hipX = (p[23].x + p[24].x) / 2;
  const hipY = (p[23].y + p[24].y) / 2;
  const width = Math.abs(p[11].x - p[12].x);
  const torso = hipY - shoulderY;
  if (width < 0.06 || torso < 0.1) return correction("Face the camera and stand upright");
  if (a.leftKnee! < 155 - slack || a.rightKnee! < 155 - slack) return correction("Gently straighten your knees without locking them");
  if (a.leftHip! < 155 - slack || a.rightHip! < 155 - slack) {
    return correction(poseIndex === 0 ? "Stand tall with your shoulders above your hips" : "Lengthen your torso and reduce the bend at your hips");
  }
  if (Math.abs(shoulderX - hipX) > width * (0.3 + margin)) {
    return correction("Keep your shoulders centered above your hips");
  }
  if (Math.abs(p[27].x - p[28].x) > width * (0.85 + margin)) return correction("Bring your feet closer together");
  if (poseIndex === 0) {
    if (Math.abs(p[15].x - p[16].x) > width * (0.45 + margin) || Math.abs(p[15].y - p[16].y) > torso * (0.25 + margin)) {
      return correction("Bring your hands together");
    }
    if ([15, 16].some(i => p[i].y < shoulderY - torso * (0.1 + margin) || p[i].y > shoulderY + torso * (0.6 + margin) ||
      Math.abs(p[i].x - shoulderX) > width * (0.4 + margin))) return correction("Move your hands to the center of your chest");
    if (a.leftElbow! > 125 + slack || a.rightElbow! > 125 + slack) return correction("Bend your elbows and bring your hands toward your chest");
  }
  return { ready: true, kind: "ready", message: "Good position — hold and breathe" };
}
