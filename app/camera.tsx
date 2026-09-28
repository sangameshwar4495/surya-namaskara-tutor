import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import CameraOverlay from "../src/components/CameraOverlay";
import DetectionStatus from "../src/components/DetectionStatus";

export default function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
const device = useCameraDevice("front");

if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Camera Permission Required</Text>

        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
if (device == null) {
  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.title}>Loading Camera...</Text>
    </SafeAreaView>
  );
}
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraContainer}>
        <Camera
            style={StyleSheet.absoluteFillObject}
            device={device}
            isActive={true}
            resizeMode="contain"
        />

        <CameraOverlay />
        <DetectionStatus status="Searching for person..." />
      </View>

      <TouchableOpacity
        style={[styles.button, { opacity: 0.5 }]}
        disabled
      >
        <Text style={styles.buttonText}>Start Yoga</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFBF8",
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
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#FAFBF8",
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 20,
  },

  button: {
    backgroundColor: "rgb(91,123,97)",
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
});