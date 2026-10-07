import { Landmark } from "../types/pose";

/**
 * Calculates the angle ABC in 3D.
 *
 *        A
 *         \
 *          \
 *           B -------- C
 *
 * B is the joint whose angle we want.
 *
 * Example:
 *   calculateAngle(hip, knee, ankle)
 *   -> knee angle
 */
export function calculateAngle(
  a: Landmark,
  b: Landmark,
  c: Landmark
): number {
  // Vector BA
  const ba = {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };

  // Vector BC
  const bc = {
    x: c.x - b.x,
    y: c.y - b.y,
    z: c.z - b.z,
  };

  // Dot product:
  //
  // BA · BC
  //
  const dot =
    ba.x * bc.x +
    ba.y * bc.y +
    ba.z * bc.z;

  // Magnitude of BA
  const magnitudeBA = Math.sqrt(
    ba.x * ba.x +
    ba.y * ba.y +
    ba.z * ba.z
  );

  // Magnitude of BC
  const magnitudeBC = Math.sqrt(
    bc.x * bc.x +
    bc.y * bc.y +
    bc.z * bc.z
  );

  // Avoid division by zero.
  if (
    magnitudeBA === 0 ||
    magnitudeBC === 0
  ) {
    return 0;
  }

  // Formula:
  //
  // cos(theta) =
  //       BA · BC
  // -----------------
  //      |BA| |BC|
  //
  let cosine =
    dot /
    (magnitudeBA * magnitudeBC);

  /*
   * Due to floating-point precision,
   * cosine can very occasionally become
   * slightly greater than 1 or less than -1.
   *
   * acos() is only defined for [-1, 1],
   * so clamp it.
   */
  cosine = Math.max(
    -1,
    Math.min(1, cosine)
  );

  // Convert radians to degrees.
  const angle =
    Math.acos(cosine) *
    (180 / Math.PI);

  return angle;
}