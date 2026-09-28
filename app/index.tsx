import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        {/* Replace with SVG/logo later */}
        <View style={styles.logo}>
          <Text style={styles.logoEmoji}>🪷</Text>
        </View>

        <Text style={styles.title}>Yoga Pose Correction</Text>

        <Text style={styles.subtitle}>
          Improve your Surya Namaskar with real-time AI posture guidance.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/calibration")}
        >
          <Text style={styles.buttonText}>Start Session</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFBF8",
  },

  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },

  logo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#EEF3EE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 36,
  },

  logoEmoji: {
    fontSize: 48,
  },

  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111111",
    textAlign: "center",
    marginBottom: 14,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#5F6B63",
    textAlign: "center",
    marginBottom: 48,
  },

  button: {
    width: "100%",
    backgroundColor: "rgb(91,123,97)",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
});