import { router } from "expo-router";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CalibrationWebScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          Camera Calibration
        </Text>

        <Text style={styles.subtitle}>
          Camera-based pose detection is available on
          Android. You can continue here to preview the
          rest of the app interface.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/camera")}
        >
          <Text style={styles.buttonText}>
            Continue
          </Text>
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
    paddingHorizontal: 24,
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
    marginBottom: 16,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#5F6B63",
    textAlign: "center",
    marginBottom: 40,
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
});