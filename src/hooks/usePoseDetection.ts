import {
  usePoseDetection as useMediaPipePoseDetection,
  RunningMode,
  Delegate,
} from "react-native-mediapipe-posedetection";

import { useCallback, useState } from "react";
import { Platform } from "react-native";

import {
  Landmark,
  PoseDetectionResult,
} from "../types/pose";

import { calculatePoseAngles } from "../services/poseAngles";

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
   * Android front-camera frames are arriving from
   * the camera sensor in landscape coordinates,
   * while our UI is portrait.
   *
   * Rotate the normalized coordinates once:
   *
   * portrait X = 1 - raw Y
   * portrait Y = 1 - raw X
   *
   * This transformation is only for display/UI.
   * Angle calculations use the original raw
   * MediaPipe landmarks.
   */
  if (Platform.OS === "android") {
    return {
      x: 1 - y,
      y: 1 - x,
      z,
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
      point &&
      isUsableLandmark(point)
  );

  const nose = landmarks[0];

  const leftShoulder =
    landmarks[11];

  const rightShoulder =
    landmarks[12];

  const leftHip =
    landmarks[23];

  const rightHip =
    landmarks[24];

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
    isUsableLandmark(
      landmarks[25]
    ) ||
    isUsableLandmark(
      landmarks[26]
    );

  const ankleVisible =
    isUsableLandmark(
      landmarks[27]
    ) ||
    isUsableLandmark(
      landmarks[28]
    );

  if (
    !mandatoryUpperBody ||
    !kneeVisible ||
    !ankleVisible ||
    usable.length < 7
  ) {
    return false;
  }

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
      angles: {
        leftKnee: null,
        rightKnee: null,

        leftElbow: null,
        rightElbow: null,

        leftShoulder: null,
        rightShoulder: null,

        leftHip: null,
        rightHip: null,
      },
      inFrame: false,
      message:
        "Searching for person...",
    });

  // const handleResults =
  //   useCallback(
  //     (poseResult: any) => {
  //       try {
  //         const rawLandmarks =
  //           poseResult?.results?.[0]
  //             ?.landmarks?.[0];

  //         if (
  //           !Array.isArray(
  //             rawLandmarks
  //           ) ||
  //           rawLandmarks.length < 33
  //         ) {
  //           setResult({
  //             landmarks: [],
  //             angles: {
  //               leftKnee: null,
  //               rightKnee: null,

  //               leftElbow: null,
  //               rightElbow: null,

  //               leftShoulder: null,
  //               rightShoulder: null,

  //               leftHip: null,
  //               rightHip: null,
  //             },
  //             inFrame: false,
  //             message:
  //               "No person detected",
  //           });

  //           return;
  //         }

  //         /*
  //          * Keep the original MediaPipe landmarks
  //          * for anatomical calculations.
  //          *
  //          * We do NOT apply the Android coordinate
  //          * transformation here.
  //          */
  //         const rawLandmarks: Landmark[] =
  //           rawLandmarks.map(
  //             (point: any) => ({
  //               x: Number(point?.x) || 0,
  //               y: Number(point?.y) || 0,
  //               z: Number(point?.z) || 0,
  //               visibility: Math.min(
  //                 Number(
  //                   point?.visibility ?? 0
  //                 ),
  //                 Number(
  //                   point?.presence ??
  //                     point?.visibility ??
  //                     0
  //                 )
  //               ),
  //             })
  //           );

  //         /*
  //          * Calculate joint angles from the
  //          * original MediaPipe coordinates.
  //          */
  //         const angles =
  //           calculatePoseAngles(
  //             rawLandmarks
  //           );

  //         /*
  //          * Transform a separate copy for
  //          * visualization and full-body detection.
  //          */
  //         const landmarks: Landmark[] =
  //           rawLandmarks.map(
  //             (point) =>
  //               transformLandmark(point)
  //           );

  //         const fullBody =
  //           checkFullBody(
  //             landmarks
  //           );

  //         setResult({
  //           landmarks,
  //           angles,
  //           inFrame: fullBody,
  //           message: fullBody
  //             ? "Person detected"
  //             : "Show your whole body",
  //         });
  //       } catch (error) {
  //         console.error(
  //           "Pose result processing error:",
  //           error
  //         );

  //         setResult({
  //           landmarks: [],
  //           angles: {
  //             leftKnee: null,
  //             rightKnee: null,

  //             leftElbow: null,
  //             rightElbow: null,

  //             leftShoulder: null,
  //             rightShoulder: null,

  //             leftHip: null,
  //             rightHip: null,
  //           },
  //           inFrame: false,
  //           message:
  //             "Detection error",
  //         });
  //       }
  //     },
  //     []
  //   );

  const handleResults =
  useCallback(
    (poseResult: any) => {
      try {
        const mediaPipeLandmarks =
          poseResult?.results?.[0]
            ?.landmarks?.[0];

        if (
          !Array.isArray(
            mediaPipeLandmarks
          ) ||
          mediaPipeLandmarks.length < 33
        ) {
          setResult({
            landmarks: [],
            angles: {
              leftKnee: null,
              rightKnee: null,

              leftElbow: null,
              rightElbow: null,

              leftShoulder: null,
              rightShoulder: null,

              leftHip: null,
              rightHip: null,
            },
            inFrame: false,
            message:
              "No person detected",
          });

          return;
        }

        /*
         * Keep the original MediaPipe landmarks
         * for anatomical calculations.
         */
        const rawLandmarks: Landmark[] =
          mediaPipeLandmarks.map(
            (point: any) => ({
              x: Number(point?.x) || 0,
              y: Number(point?.y) || 0,
              z: Number(point?.z) || 0,
              visibility: Math.min(
                Number(
                  point?.visibility ?? 0
                ),
                Number(
                  point?.presence ??
                    point?.visibility ??
                    0
                )
              ),
            })
          );

        /*
         * Calculate joint angles from the
         * original MediaPipe coordinates.
         */
        const angles =
          calculatePoseAngles(
            rawLandmarks
          );

        /*
         * Transform a separate copy for
         * visualization and full-body detection.
         */
        const landmarks: Landmark[] =
          rawLandmarks.map(
            (point) =>
              transformLandmark(point)
          );

        const fullBody =
          checkFullBody(
            landmarks
          );

        setResult({
          landmarks,
          angles,
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
          angles: {
            leftKnee: null,
            rightKnee: null,

            leftElbow: null,
            rightElbow: null,

            leftShoulder: null,
            rightShoulder: null,

            leftHip: null,
            rightHip: null,
          },
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
        onResults:
          handleResults,

        onError: (error: any) => {
          console.error(
            "MediaPipe pose detection error:",
            error
          );

          setResult({
            landmarks: [],
            angles: {
              leftKnee: null,
              rightKnee: null,

              leftElbow: null,
              rightElbow: null,

              leftShoulder: null,
              rightShoulder: null,

              leftHip: null,
              rightHip: null,
            },
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
         * Do not force camera/output orientation.
         * Android coordinate transformation is handled
         * separately by transformLandmark().
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