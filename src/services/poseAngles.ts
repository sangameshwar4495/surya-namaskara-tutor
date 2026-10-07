import { Landmark } from "../types/pose";
import { calculateAngle } from "./angleCalculator";

export interface PoseAngles {
  leftKnee: number | null;
  rightKnee: number | null;

  leftElbow: number | null;
  rightElbow: number | null;

  leftShoulder: number | null;
  rightShoulder: number | null;

  leftHip: number | null;
  rightHip: number | null;
}

/**
 * Minimum visibility required for the three
 * landmarks used to calculate an angle.
 */
const ANGLE_VISIBILITY_THRESHOLD = 0.3;

/**
 * Returns true when a landmark is suitable
 * for angle calculation.
 */
function isUsableLandmark(
  point: Landmark | undefined
): point is Landmark {
  return (
    !!point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    point.visibility >=
      ANGLE_VISIBILITY_THRESHOLD
  );
}

/**
 * Calculates an angle only when all three
 * required landmarks are reliable.
 *
 * A = first landmark
 * B = joint landmark
 * C = third landmark
 *
 * Returns null when the angle cannot be
 * calculated reliably.
 */
function getAngle(
  landmarks: Landmark[],
  aIndex: number,
  bIndex: number,
  cIndex: number
): number | null {
  const a = landmarks[aIndex];
  const b = landmarks[bIndex];
  const c = landmarks[cIndex];

  if (
    !isUsableLandmark(a) ||
    !isUsableLandmark(b) ||
    !isUsableLandmark(c)
  ) {
    return null;
  }

  return calculateAngle(a, b, c);
}

/**
 * Calculate the major joint angles from
 * MediaPipe's 33 body landmarks.
 *
 * MediaPipe landmark indices:
 *
 * 11 - Left shoulder
 * 12 - Right shoulder
 * 13 - Left elbow
 * 14 - Right elbow
 * 15 - Left wrist
 * 16 - Right wrist
 * 23 - Left hip
 * 24 - Right hip
 * 25 - Left knee
 * 26 - Right knee
 * 27 - Left ankle
 * 28 - Right ankle
 */
export function calculatePoseAngles(
  landmarks: Landmark[]
): PoseAngles {
  if (
    !Array.isArray(landmarks) ||
    landmarks.length < 33
  ) {
    return {
      leftKnee: null,
      rightKnee: null,

      leftElbow: null,
      rightElbow: null,

      leftShoulder: null,
      rightShoulder: null,

      leftHip: null,
      rightHip: null,
    };
  }

  return {
    /*
     * Knee angles
     *
     * Hip → Knee → Ankle
     */
    leftKnee: getAngle(
      landmarks,
      23, // Left hip
      25, // Left knee
      27  // Left ankle
    ),

    rightKnee: getAngle(
      landmarks,
      24, // Right hip
      26, // Right knee
      28  // Right ankle
    ),

    /*
     * Elbow angles
     *
     * Shoulder → Elbow → Wrist
     */
    leftElbow: getAngle(
      landmarks,
      11, // Left shoulder
      13, // Left elbow
      15  // Left wrist
    ),

    rightElbow: getAngle(
      landmarks,
      12, // Right shoulder
      14, // Right elbow
      16  // Right wrist
    ),

    /*
     * Shoulder angles
     *
     * Elbow → Shoulder → Hip
     */
    leftShoulder: getAngle(
      landmarks,
      13, // Left elbow
      11, // Left shoulder
      23  // Left hip
    ),

    rightShoulder: getAngle(
      landmarks,
      14, // Right elbow
      12, // Right shoulder
      24  // Right hip
    ),

    /*
     * Hip angles
     *
     * Shoulder → Hip → Knee
     */
    leftHip: getAngle(
      landmarks,
      11, // Left shoulder
      23, // Left hip
      25  // Left knee
    ),

    rightHip: getAngle(
      landmarks,
      12, // Right shoulder
      24, // Right hip
      26  // Right knee
    ),
  };
}