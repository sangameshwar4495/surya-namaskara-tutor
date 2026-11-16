import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, demoStyles } from "./styles";

export default function KeyPoints({ points, cautions = [], source }: { points: readonly string[]; cautions?: readonly string[]; source?: string }) {
  return <View style={styles.container}>
    <Text style={styles.heading}>Key Points</Text>
    {points.map(point => <View key={point} style={[demoStyles.row, styles.point]}>
      <Feather name="check-circle" size={19} color={colors.accent} style={styles.icon} />
      <Text style={[demoStyles.subtitle, styles.text]}>{point}</Text>
    </View>)}
    {cautions.length > 0 && <>
      <Text style={styles.subheading}>Caution</Text>
      {cautions.map(caution => <View key={caution} style={[demoStyles.row, styles.point]}>
        <Feather name="alert-circle" size={19} color={colors.caution} style={styles.icon} />
        <Text style={[demoStyles.subtitle, styles.text]}>{caution}</Text>
      </View>)}
    </>}
    {!!source && <Text style={styles.source}>{source}</Text>}
  </View>;
}
const styles = StyleSheet.create({ container: { gap: 14 }, heading: { color: colors.text, fontSize: 22, fontWeight: "800" }, subheading: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 }, point: { alignItems: "flex-start" }, icon: { marginTop: 3 }, text: { flex: 1 }, source: { color: colors.muted, fontSize: 13, lineHeight: 19 } });
