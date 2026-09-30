import { Landmark } from "../types/pose";

const REQUIRED_POINTS = [
  0,  // Nose
  11, // Left shoulder
  12, // Right shoulder
  23, // Left hip
  24, // Right hip
  25, // Left knee
  26, // Right knee
  27, // Left ankle
  28, // Right ankle
];

const VISIBILITY_THRESHOLD = 0.3;
const MIN_VISIBLE_POINTS = 6;

export function checkPersonInFrame(
  landmarks: Landmark[]
): { inFrame: boolean; message: string } {
  if (!Array.isArray(landmarks) || landmarks.length < 33) {
    return {
      inFrame: false,
      message: "No person detected",
    };
  }

  const visiblePoints = REQUIRED_POINTS.filter((index) => {
    const point = landmarks[index];

    return (
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.visibility >= VISIBILITY_THRESHOLD
    );
  });

  if (visiblePoints.length < MIN_VISIBLE_POINTS) {
    return {
      inFrame: false,
      message: "Move into the frame",
    };
  }

  /*
   * At this stage we only need to establish:
   *
   * MediaPipe detected a person
   * + enough major body landmarks are visible.
   *
   * We intentionally do NOT perform x/y edge checks here.
   * The raw MediaPipe coordinates are affected by camera
   * orientation/mirroring, and those checks were causing
   * unnecessary rejection.
   */

  return {
    inFrame: true,
    message: "Perfect! Hold Still",
  };
}