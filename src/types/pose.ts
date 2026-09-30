export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseDetectionResult {
  landmarks: Landmark[];
  inFrame: boolean;
  message: string;
}