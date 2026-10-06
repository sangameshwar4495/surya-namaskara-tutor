import { StyleSheet, Text, View } from "react-native";
import { colors } from "./styles";

export default function PoseProgress({ current, total }: { current: number; total: number }) {
  return <View style={styles.container}>
    <Text style={styles.label} accessibilityLiveRegion="polite">Pose {current} of {total}</Text>
    <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Sequence progress" accessibilityValue={{ min: 0, max: total, now: current }}>
      <View style={[styles.fill, { width: `${current / total * 100}%` }]} />
    </View>
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, gap: 10 }, label: { color: colors.accent, fontSize: 14, fontWeight: "700" }, track: { height: 5, borderRadius: 3, backgroundColor: colors.pale, overflow: "hidden" }, fill: { height: "100%", backgroundColor: colors.primary } });
