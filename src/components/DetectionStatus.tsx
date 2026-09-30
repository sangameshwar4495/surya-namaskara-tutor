import { StyleSheet, Text, View } from "react-native";

export default function DetectionStatus({
  status,
  ready,
}: {
  status: string;
  ready: boolean;
}) {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: ready ? "#4CAF50" : "#D97706" },
      ]}
    >
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 20,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },

  text: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
});