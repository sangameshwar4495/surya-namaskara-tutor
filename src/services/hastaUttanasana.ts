import type { PoseDetectionResult } from "../types/pose";
import { reliablePoint, visibleSide } from "./sideTracking";

/** Side-profile geometry: heel-to-toe direction distinguishes backward from forward. */
export function checkHastaProfile(result: PoseDetectionResult, accepted = false): string | null {
  const p = result.landmarks;
  const side = visibleSide(p);
  if (!side) return "Keep your camera-facing side visible";
  const torso = p[side.hip].y - p[side.shoulder].y;
  if (torso < 0.12) return "Keep your torso lifted and your whole body in view";
  if (([11,12].every(i=>reliablePoint(p[i])) && Math.abs(p[11].x - p[12].x) > torso * 0.35) ||
    ([23,24].every(i=>reliablePoint(p[i])) && Math.abs(p[23].x - p[24].x) > torso * 0.3)) {
    return "Turn sideways to the camera, facing right like the reference";
  }
  const foot = p[side.toe].x - p[side.heel].x;
  if (foot < torso * 0.06) {
    return "Stand sideways with both toes pointing right like the reference";
  }
  const hipX = p[side.hip].x;
  const shoulderX = p[side.shoulder].x;
  const backward = (hipX - shoulderX) / torso;
  if (backward < (accepted ? 0.12 : 0.15)) return "Lift your chest into a small comfortable backward arch; do not fold forward";
  if (backward > 0.9) return "Ease out of the bend and keep your chest lifted";
  if (p[27].visibility >= 0.6 && p[28].visibility >= 0.6 && (Math.abs(p[27].x - p[28].x) > torso * 0.3 || Math.abs(p[27].y - p[28].y) > torso * 0.15)) {
    return "Keep both feet together on the floor";
  }
  if ([15,16].filter(i => p[i].visibility >= 0.6).some(i => p[i].y > p[side.shoulder].y - torso * 0.45 || p[i].x > shoulderX + torso * 0.15)) {
    return "Reach both arms overhead and back alongside your ears";
  }
  return null;
}
