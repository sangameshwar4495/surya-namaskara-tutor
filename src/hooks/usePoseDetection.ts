import {
  usePoseDetection as useMediaPipePoseDetection,
  RunningMode,
  Delegate,
} from "react-native-mediapipe-posedetection";

import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { Landmark, PoseDetectionResult } from "../types/pose";

const FULL_BODY_POINTS = [
  0,  // nose
  11, // left shoulder
  12, // right shoulder
  23, // left hip
  24, // right hip
  25, // left knee
  26, // right knee
  27, // left ankle
  28, // right ankle
];

function isUsableLandmark(point: Landmark) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0.02 &&
    point.x <= 0.98 &&
    point.y >= 0.02 &&
    point.y <= 0.98 &&
    point.visibility >= 0.5
  );
}

function transformLandmark(
  point: any
): Landmark {
  const x = Number(point?.x) || 0;
  const y = Number(point?.y) || 0;
  const z = Number(point?.z) || 0;

  const visibility = Number(
    point?.visibility ?? 0
  );

  const presence = Number(
    point?.presence ?? visibility
  );

  /*
   * Android front-camera frames are arriving from the
   * camera sensor in landscape coordinates (640x480),
   * while our UI is portrait.
   *
   * Rotate the normalized coordinates once:
   *
   * portrait X = raw Y
   * portrait Y = 1 - raw X
   */
  if (Platform.OS === "android") {
    return {
      x: 1-y,
      y: 1 - x,
      z,
      // Require BOTH visibility and presence to be reasonable.
      visibility: Math.min(
        visibility,
        presence
      ),
    };
  }

  return {
    x,
    y,
    z,
    visibility: Math.min(
      visibility,
      presence
    ),
  };
}

function checkFullBody(
  landmarks: Landmark[]
) {
  const points = FULL_BODY_POINTS.map(
    (index) => landmarks[index]
  );

  const usable = points.filter(
    (point) =>
      point && isUsableLandmark(point)
  );

  /*
   * Head-only / upper-body-only detection must NOT
   * count as a person ready for yoga.
   *
   * We require:
   * - nose
   * - both shoulders
   * - both hips
   * - at least one knee
   * - at least one ankle
   */
  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  const mandatoryUpperBody =
    !!nose &&
    !!leftShoulder &&
    !!rightShoulder &&
    !!leftHip &&
    !!rightHip &&
    isUsableLandmark(nose) &&
    isUsableLandmark(leftShoulder) &&
    isUsableLandmark(rightShoulder) &&
    isUsableLandmark(leftHip) &&
    isUsableLandmark(rightHip);

  const kneeVisible =
    isUsableLandmark(landmarks[25]) ||
    isUsableLandmark(landmarks[26]);

  const ankleVisible =
    isUsableLandmark(landmarks[27]) ||
    isUsableLandmark(landmarks[28]);

  if (
    !mandatoryUpperBody ||
    !kneeVisible ||
    !ankleVisible ||
    usable.length < 7
  ) {
    return false;
  }

  /*
   * Also make sure the detected body occupies a meaningful
   * vertical portion of the camera. This prevents tiny/random
   * detections from enabling the button.
   */
  const ys = usable.map(
    (point) => point.y
  );

  const bodyHeight =
    Math.max(...ys) -
    Math.min(...ys);

  return bodyHeight >= 0.45;
}

export function usePoseDetection() {
  const [result, setResult] =
    useState<PoseDetectionResult>({
      landmarks: [],
      inFrame: false,
      message:
        "Searching for person...",
    });

  const handleResults = useCallback(
    (poseResult: any) => {
      try {
        /*
         * IMPORTANT:
         * Native module returns:
         *
         * poseResult.results[0].landmarks[0]
         */
        const rawLandmarks =
          poseResult?.results?.[0]
            ?.landmarks?.[0];

        if (
          !Array.isArray(rawLandmarks) ||
          rawLandmarks.length < 33
        ) {
          setResult({
            landmarks: [],
            inFrame: false,
            message:
              "No person detected",
          });
          return;
        }

        const landmarks: Landmark[] =
          rawLandmarks.map(
            transformLandmark
          );

        const fullBody =
          checkFullBody(landmarks);

        setResult({
          landmarks,
          inFrame: fullBody,
          message: fullBody
            ? "Person detected"
            : "Show your whole body",
        });
      } catch (error) {
        console.error(
          "Pose result processing error:",
          error
        );

        setResult({
          landmarks: [],
          inFrame: false,
          message:
            "Detection error",
        });
      }
    },
    []
  );

  const poseDetection =
    useMediaPipePoseDetection(
      {
        onResults: handleResults,

        onError: (error: any) => {
          console.error(
            "MediaPipe pose detection error:",
            error
          );

          setResult({
            landmarks: [],
            inFrame: false,
            message:
              "Detection error",
          });
        },
      },

      RunningMode.LIVE_STREAM,

      "pose_landmarker_lite.task",

      {
        numPoses: 1,

        minPoseDetectionConfidence: 0.3,
        minPosePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,

        delegate: Delegate.GPU,

        shouldOutputSegmentationMasks:
          false,

        fpsMode: 30,

        /*
         * DO NOT force camera/output orientation here.
         * We perform exactly one coordinate transform
         * ourselves for Android.
         */
        mirrorMode:
          "mirror-front-only",
      }
    );

  return {
    poseResult: result,

    frameProcessor:
      poseDetection.frameProcessor,

    cameraViewLayoutChangeHandler:
      poseDetection.cameraViewLayoutChangeHandler,
  };
}