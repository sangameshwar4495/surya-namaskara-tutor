import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CameraWebScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>📱</Text>

        <Text style={styles.title}>
          Camera preview unavailable
        </Text>

        <Text style={styles.subtitle}>
          Pose detection uses the native Android camera.
          Run the app on your Android device to use this feature.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F5EE",
  },

  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },

  icon: {
    fontSize: 52,
    marginBottom: 24,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#172923",
    textAlign: "center",
    marginBottom: 12,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#68756F",
    textAlign: "center",
  },
});