import { StyleSheet, View } from "react-native";

export default function CameraOverlay() {
  return (
    <View style={styles.overlay}>
      <View style={styles.frame} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },

  frame: {
    width: "84%",
    height: "88%",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 24,
  },
});