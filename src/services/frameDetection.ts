import type { Landmark } from "../types/pose";

// Normalized display coordinates, including hands and feet, not just torso joints.
const REQUIRED_POINTS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export function checkPersonInFrame(landmarks: Landmark[]): { inFrame: boolean; message: string } {
  if (!Array.isArray(landmarks) || landmarks.length < 33) {
    return { inFrame: false, message: "Step into view so the camera can see you" };
  }
  if (!REQUIRED_POINTS.every(i => {
    const p = landmarks[i];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility >= 0.5;
  })) return { inFrame: false, message: "Keep your head, hands and both feet visible in good light" };
  if (!REQUIRED_POINTS.every(i => {
    const p = landmarks[i];
    return p.x >= 0.04 && p.x <= 0.96 && p.y >= 0.04 && p.y <= 0.96;
  })) return { inFrame: false, message: "Step back and center yourself — leave space above your head and below your feet" };
  return { inFrame: true, message: "Full body visible — stay in frame" };
}
