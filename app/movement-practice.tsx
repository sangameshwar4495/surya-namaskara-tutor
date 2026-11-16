import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, demoStyles } from "../src/components/demo/styles";
import { MOVEMENT_POSES } from "../src/data/movementPoses";
import { MOVEMENT_SETUP } from "../src/services/learnedGuidance";

/** Each pose is practiced on its own; nothing advances to another pose automatically. */
export default function MovementPracticeSelection() {
  return <SafeAreaView style={demoStyles.screen}>
    <ScrollView contentContainerStyle={demoStyles.content}>
      <View style={demoStyles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Practice Mode" style={demoStyles.iconButton} onPress={() => router.dismissTo("/practice-mode")}><Feather name="arrow-left" size={22} color={colors.accent} /></TouchableOpacity>
        <Text style={demoStyles.eyebrow}>PRACTICE YOGA POSES</Text>
      </View>
      <View style={styles.header}>
        <Text style={demoStyles.title} accessibilityRole="header">Choose a pose</Text>
        <Text style={demoStyles.subtitle}>Practice one pose at a time with live corrections. When you finish, you can repeat it or come back here to choose another.</Text>
      </View>
      {MOVEMENT_POSES.map(pose => <TouchableOpacity key={pose.name} accessibilityRole="button" accessibilityLabel={`Practice ${pose.name}, ${pose.subtitle}`}
        activeOpacity={0.85} style={[demoStyles.card, styles.card]}
        onPress={() => router.push({ pathname: "/dataset-practice", params: { pose: pose.name } })}>
        <View style={demoStyles.row}>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{pose.name}</Text>
            <Text style={styles.cardSubtitle}>{pose.subtitle}</Text>
          </View>
          <Feather name="arrow-right" size={22} color={colors.accent} />
        </View>
        {!!MOVEMENT_SETUP[pose.name] && <Text style={styles.cardDetail}>{MOVEMENT_SETUP[pose.name]}</Text>}
      </TouchableOpacity>)}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  header: { gap: 10 },
  card: { padding: 20, gap: 10 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  cardSubtitle: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  cardDetail: { color: colors.muted, fontSize: 15, lineHeight: 21 },
});
