import { PRACTICE_POSES } from "../data/practicePoses";
import type { PoseDetectionResult } from "../types/pose";
import { checkSideInFrame } from "./sideTracking";

export function practiceFraming(result: PoseDetectionResult, index: number) {
  return PRACTICE_POSES[index]?.camera === "side" ? checkSideInFrame(result.landmarks)
    : { inFrame: result.inFrame, message: result.message };
}
