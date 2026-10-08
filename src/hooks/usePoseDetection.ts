import { usePoseDetection as useMediaPipePoseDetection, RunningMode, Delegate } from "react-native-mediapipe-posedetection";
import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { emptyDetection, processDetection } from "../services/processDetection";

export function usePoseDetection() {
  const [result, setResult] = useState(() => emptyDetection("Searching for person...", 0));
  const handleResults = useCallback((payload: unknown) => {
    setResult(processDetection(payload, Platform.OS === "android", performance.now()));
  }, []);
  const handleError = useCallback((error: unknown) => {
    console.error("MediaPipe pose detection error:", error);
    setResult(emptyDetection("Detection error. Restart practice to retry.", performance.now()));
  }, []);
  const detection = useMediaPipePoseDetection(
    { onResults: handleResults, onError: handleError },
    RunningMode.LIVE_STREAM,
    "pose_landmarker_lite.task",
    {
      numPoses: 1,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
      delegate: Delegate.GPU,
      shouldOutputSegmentationMasks: false,
      fpsMode: 30,
      mirrorMode: "mirror-front-only",
    }
  );
  return {
    poseResult: result,
    frameProcessor: detection.frameProcessor,
    cameraViewLayoutChangeHandler: detection.cameraViewLayoutChangeHandler,
  };
}
