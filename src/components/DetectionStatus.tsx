import { StyleSheet, Text, View } from "react-native";

export default function DetectionStatus({ status }: { status: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 20,
    alignSelf: "center",
    backgroundColor: "rgba(17,17,17,0.7)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },

  text: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
});