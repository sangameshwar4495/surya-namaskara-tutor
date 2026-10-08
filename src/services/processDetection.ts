import type { Landmark, PoseDetectionResult } from "../types/pose";
import { calculatePoseAngles } from "./poseAngles";
import { checkPersonInFrame } from "./frameDetection";

type Point = Partial<Landmark> & { presence?: number };
const coordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : NaN;
function normalize(point: Point | undefined, confidence?: Landmark): Landmark {
  return {
    x: coordinate(point?.x), y: coordinate(point?.y), z: coordinate(point?.z),
    visibility: Math.min(coordinate(point?.visibility ?? confidence?.visibility ?? 0),
      coordinate(point?.presence ?? point?.visibility ?? confidence?.visibility ?? 0)),
  };
}

export function emptyDetection(message: string, receivedAt: number): PoseDetectionResult {
  return { landmarks: [], angles: calculatePoseAngles([]), inFrame: false, message, receivedAt };
}

export function processDetection(payload: unknown, android: boolean, receivedAt: number): PoseDetectionResult {
  const pose = (payload as { results?: { landmarks?: Point[][]; worldLandmarks?: Point[][] }[] })?.results?.[0];
  const points = pose?.landmarks?.[0];
  if (!Array.isArray(points) || points.length < 33) return emptyDetection("No person detected", receivedAt);
  const raw = Array.from(points, point => normalize(point));
  // Preserve the existing Android display orientation; never use it for 3D angles.
  const landmarks = raw.map(point => android ? { ...point, x: 1 - point.y, y: 1 - point.x } : point);
  const world = pose?.worldLandmarks?.[0];
  const angles = calculatePoseAngles(Array.isArray(world)
    ? Array.from(world, (point, index) => normalize(point, raw[index])) : []);
  return { landmarks, angles, receivedAt, ...checkPersonInFrame(landmarks) };
}
