import { PoseAngles } from "../services/poseAngles";
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseDetectionResult {
  receivedAt: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  angles: PoseAngles;
  inFrame: boolean;
  message: string;
}
