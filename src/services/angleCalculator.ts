import { Landmark } from "../types/pose";

/**
 * Calculates the angle ABC in the 2D image plane.
 *
 *        A
 *         \
 *          \
 *           B -------- C
 *
 * B is the joint whose angle we want.
 *
 * Examples:
 *   calculateAngle(hip, knee, ankle)
 *   -> knee angle
 *
 *   calculateAngle(shoulder, elbow, wrist)
 *   -> elbow angle
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
  };

  // Vector BC
  const bc = {
    x: c.x - b.x,
    y: c.y - b.y,
  };

  // Dot product:
  //
  // BA · BC
  //
  const dot =
    ba.x * bc.x +
    ba.y * bc.y;

  // Magnitude of BA
  const magnitudeBA = Math.sqrt(
    ba.x * ba.x +
    ba.y * ba.y
  );

  // Magnitude of BC
  const magnitudeBC = Math.sqrt(
    bc.x * bc.x +
    bc.y * bc.y
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
  //              BA · BC
  // cos(theta) = ---------
  //              |BA||BC|
  //
  let cosine =
    dot /
    (magnitudeBA * magnitudeBC);

  // Protect acos() from floating-point errors.
  cosine = Math.max(
    -1,
    Math.min(1, cosine)
  );

  // Convert radians to degrees.
  return (
    Math.acos(cosine) *
    (180 / Math.PI)
  );
}