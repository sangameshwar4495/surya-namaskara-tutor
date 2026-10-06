import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, demoStyles } from "./styles";

export default function DemoNavigation({ isFirst, isLast, onPrevious, onNext }: { isFirst: boolean; isLast: boolean; onPrevious: () => void; onNext: () => void }) {
  return <View style={styles.row}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: isFirst }} disabled={isFirst} onPress={onPrevious} style={[demoStyles.primary, styles.previous, isFirst && styles.disabled]}>
      <Text style={[demoStyles.buttonText, styles.previousText]}>Previous</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={onNext} style={[demoStyles.primary, styles.next]}>
      <Text style={demoStyles.buttonText}>{isLast ? "Finish Demo" : "Next Pose"}</Text>
    </TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, previous: { flex: 1, minWidth: 110, backgroundColor: colors.pale }, previousText: { color: colors.accent }, next: { flex: 1, minWidth: 140 }, disabled: { opacity: 0.4 } });
