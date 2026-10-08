import type { PoseDetectionResult } from "../types/pose";

export const PRACTICE_POSES = [
  { name: "Prayer Pose", instruction: "Face the camera. Stand tall and bring your hands together at your chest." },
  { name: "Raised Arms", instruction: "Stay upright and raise both arms overhead. Keep breathing comfortably." },
] as const;

export interface Evaluation { ready: boolean; message: string }
const correction = (message: string): Evaluation => ({ ready: false, message });

/** Initial coaching tolerances, to be tuned with real-device recordings. */
export function evaluatePose(result: PoseDetectionResult, poseIndex: number): Evaluation {
  if (!PRACTICE_POSES[poseIndex]) return correction("Practice complete");
  if (!result.inFrame) return correction(result.message);
  const p = result.landmarks;
  if (![11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].every(i =>
    p[i] && p[i].visibility >= 0.6 && [p[i].x, p[i].y, p[i].z].every(Number.isFinite) &&
    p[i].x > 0.02 && p[i].x < 0.98 && p[i].y > 0.02 && p[i].y < 0.98)) {
    return correction("Keep both hands, arms and legs visible");
  }
  const a = result.angles;
  if (Object.values(a).some(value => value === null || !Number.isFinite(value))) {
    return correction("Waiting for reliable joint measurements");
  }
  const shoulderX = (p[11].x + p[12].x) / 2;
  const shoulderY = (p[11].y + p[12].y) / 2;
  const hipX = (p[23].x + p[24].x) / 2;
  const hipY = (p[23].y + p[24].y) / 2;
  const width = Math.abs(p[11].x - p[12].x);
  const torso = hipY - shoulderY;
  if (width < 0.06 || torso < 0.1) return correction("Face the camera and stand upright");
  if (a.leftKnee! < 155 || a.rightKnee! < 155) return correction("Gently straighten your knees without locking them");
  if (a.leftHip! < 155 || a.rightHip! < 155 || Math.abs(shoulderX - hipX) > width * 0.3) {
    return correction("Stand tall with your shoulders above your hips");
  }
  if (Math.abs(p[27].x - p[28].x) > width * 0.85) return correction("Bring your feet closer together");
  if (poseIndex === 0) {
    if (Math.abs(p[15].x - p[16].x) > width * 0.45 || Math.abs(p[15].y - p[16].y) > torso * 0.25) {
      return correction("Bring your hands together");
    }
    if ([15, 16].some(i => p[i].y < shoulderY - torso * 0.1 || p[i].y > shoulderY + torso * 0.6 ||
      Math.abs(p[i].x - shoulderX) > width * 0.4)) return correction("Move your hands to the center of your chest");
    if (a.leftElbow! > 125 || a.rightElbow! > 125) return correction("Bend your elbows and bring your hands toward your chest");
  } else {
    if ([15, 16].some(i => p[i].y > shoulderY - torso * 0.45) || a.leftShoulder! < 150 || a.rightShoulder! < 150) {
      return correction("Lift both arms overhead");
    }
    if (a.leftElbow! < 150 || a.rightElbow! < 150) return correction("Gently straighten both arms");
  }
  return { ready: true, message: "Good position — hold and breathe" };
}
