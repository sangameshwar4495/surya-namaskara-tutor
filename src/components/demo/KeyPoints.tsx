import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, demoStyles } from "./styles";

export default function KeyPoints({ points }: { points: readonly string[] }) {
  return <View style={styles.container}>
    <Text style={styles.heading}>Key Points</Text>
    {points.map(point => <View key={point} style={[demoStyles.row, styles.point]}>
      <Feather name="check-circle" size={19} color={colors.accent} style={styles.icon} />
      <Text style={[demoStyles.subtitle, styles.text]}>{point}</Text>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({ container: { gap: 14 }, heading: { color: colors.text, fontSize: 22, fontWeight: "800" }, point: { alignItems: "flex-start" }, icon: { marginTop: 3 }, text: { flex: 1 } });
