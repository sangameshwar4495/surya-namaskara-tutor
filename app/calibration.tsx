import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
export default function CalibrationScreen() {
const { hasPermission, requestPermission } = useCameraPermission();
const device = useCameraDevice("front");

// const format =
//   device?.formats.find(
//     (f) => f.videoWidth / f.videoHeight === 4 / 3
//   ) ?? device?.formats[0];

  if (!hasPermission) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.permissionContainer}>
        <Text style={styles.title}>Camera Permission Required</Text>
        <Text style={styles.subtitle}>
          We need access to your camera for pose detection.
        </Text>

        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
if (device == null) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.permissionContainer}>
        <Text style={styles.title}>Loading Camera...</Text>
      </View>
    </SafeAreaView>
  );
}
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        <Text style={styles.title}>Camera Calibration</Text>
        <Text style={styles.subtitle}>
          Stand inside the frame and keep your full body visible before starting.
        </Text>

        {/* Camera frame placeholder */}
        <View style={styles.frame}>
            <Camera
              style={StyleSheet.absoluteFillObject}
              device={device!}
              isActive={true}
              resizeMode="contain"
            />

          {/* Overlay */}
        <View style={styles.overlay}>
          <View style={styles.guideFrame}>
            {/* <Feather name="user" size={90} color="rgba(255,255,255,0.6)" />  */}
          </View>
        </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Instruction icon="maximize" text="Keep your entire body inside the frame." />
          <Instruction icon="sun" text="Ensure the room has good lighting." />
          <Instruction icon="move" text="Stand about 2–3 meters from the camera." />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/camera")}
        >
          <Text style={styles.buttonText}>Continue to Detection</Text>
        </TouchableOpacity>
        
      </View>
    </SafeAreaView>
    
  );
}

function Instruction({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={styles.instructionRow}>
      <Feather name={icon} size={20} color="rgb(91,123,97)" />
      <Text style={styles.instructionText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFBF8",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-evenly",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#111111",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#5F6B63",
    textAlign: "center",
    lineHeight: 24,
    marginTop: -10,
  },
frame: {
  width: "100%",
  aspectRatio: 3 / 4,   // Portrait body frame
  borderRadius: 24,
  overflow: "hidden",
  backgroundColor: "#000",
},
overlay: {
  ...StyleSheet.absoluteFillObject,
  borderWidth: 2,
  borderStyle: "dashed",
  borderColor: "rgba(255,255,255,0.8)",
  justifyContent: "center",
  alignItems: "center",
  borderRadius: 24,
},
permissionContainer: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: 24,
},
  instructions: {
    gap: 18,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  instructionText: {
    marginLeft: 14,
    fontSize: 15,
    color: "#444",
    flex: 1,
  },
  button: {
    backgroundColor: "rgb(91,123,97)",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  guideFrame: {
    width: "82%",
    height: "88%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    borderStyle: "dashed",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  }, 
});