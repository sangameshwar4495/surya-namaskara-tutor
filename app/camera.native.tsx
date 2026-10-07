import React from "react";
import {
  Camera,
  useCameraDevice,
} from "react-native-vision-camera";

import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import CameraOverlay from "../src/components/CameraOverlay";
import DetectionStatus from "../src/components/DetectionStatus";
import PoseCanvas from "../src/components/PoseCanvas";

import {
  usePoseDetection,
} from "../src/hooks/usePoseDetection";

import {router} from "expo-router";

export default function CameraScreen() {
  const device =
    useCameraDevice("front");

  const {
    poseResult,
    frameProcessor,
    cameraViewLayoutChangeHandler,
  } = usePoseDetection();

  if (!device) {
    return (
      <SafeAreaView
        style={styles.center}
      >
        <Text style={styles.title}>
          Loading Camera...
        </Text>
      </SafeAreaView>
    );
  }

  /*
   * IMPORTANT:
   * Show the skeleton whenever MediaPipe has
   * provided a pose, even when the whole body
   * is not currently in frame.
   *
   * This makes the overlay useful for the user
   * while positioning themselves.
   */
  const hasPose =
    poseResult.landmarks.length >= 33;

  const personDetected =
    poseResult.inFrame;

  const angles = poseResult.angles;

  return (
    <SafeAreaView
      style={styles.container}
    >
      <View
        style={styles.cameraContainer}
      >
        <Camera
          style={
            StyleSheet.absoluteFillObject
          }
          device={device}
          isActive={true}
          pixelFormat="rgb"
          resizeMode="contain"
          frameProcessor={
            frameProcessor
          }
          onLayout={
            cameraViewLayoutChangeHandler
          }
        />

        <CameraOverlay />

        {hasPose && (
          <PoseCanvas
            landmarks={
              poseResult.landmarks
            }
          />
        )}

        <DetectionStatus
          status={
            personDetected
              ? "Person detected"
              : poseResult.message
          }
          ready={personDetected}
        />
      </View>
      
          {/* Temporary angle display */}
      <View style={styles.anglePanel}>
        <Text style={styles.panelTitle}>
          Joint Angles
        </Text>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Left Knee
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.leftKnee
            )}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Right Knee
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.rightKnee
            )}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Left Elbow
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.leftElbow
            )}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Right Elbow
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.rightElbow
            )}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Left Shoulder
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.leftShoulder
            )}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Right Shoulder
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.rightShoulder
            )}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Left Hip
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.leftHip
            )}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.angleText}>
            Right Hip
          </Text>

          <Text style={styles.angleValue}>
            {formatAngle(
              angles.rightHip
            )}
          </Text>
        </View>
      </View>
    

      <TouchableOpacity
        style={[
          styles.button,
          {
            opacity:
              personDetected
                ? 1
                : 0.5,
          },
        ]}
        disabled={!personDetected}
        onPress={() => router.push("/practice-mode")}
      >
        <Text
          style={styles.buttonText}
        >
          Continue
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function formatAngle(
  angle: number | null
): string {
  if (angle === null) {
    return "--";
  }

  return `${Math.round(angle)}°`;
}


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        "#FAFBF8",
      padding: 16,
    },

    cameraContainer: {
      flex: 1,
      borderRadius: 24,
      overflow: "hidden",
      backgroundColor: "#000",
      position: "relative",
    },

    center: {
      flex: 1,
      justifyContent:
        "center",
      alignItems: "center",
      padding: 24,
      backgroundColor:
        "#FAFBF8",
    },

    title: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 20,
    },

    button: {
      backgroundColor:
        "rgb(91,123,97)",
      marginTop: 16,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: "center",
    },

    buttonText: {
      color: "#FFF",
      fontSize: 17,
      fontWeight: "600",
    },

    anglePanel: {
    position: "absolute",
    right: 12,
    bottom: 30,

    width: 180,

    padding: 12,

    borderRadius: 12,

    backgroundColor:
      "rgba(0, 0, 0, 0.70)",
  },

  angleText: {
    color: "#ddd",
    fontSize: 12,
  },

  angleValue: {
    color: "#45E66B",
    fontSize: 12,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",

    marginVertical: 2,
  },

  panelTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },

  });