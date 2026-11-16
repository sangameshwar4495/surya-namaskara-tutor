import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, demoStyles } from "../../src/components/demo/styles";
import { DATASET_DEMOS } from "../../src/data/datasetDemos";
import { MOVEMENT_POSES } from "../../src/data/movementPoses";

export default function DemoIntroScreen() {
  return <SafeAreaView style={demoStyles.screen}>
    <ScrollView contentContainerStyle={demoStyles.content}>
      <View style={demoStyles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Practice Mode" style={demoStyles.iconButton} onPress={() => router.dismissTo("/practice-mode")}><Feather name="arrow-left" size={22} color={colors.accent} /></TouchableOpacity>
        <Text style={demoStyles.eyebrow}>READY TO BEGIN</Text>
      </View>
      <View style={styles.header}><Text style={demoStyles.title}>Pose Demos</Text></View>
      <Text style={demoStyles.subtitle}>Choose a pose to watch its demonstration video and see the correct form before you practice.</Text>
      {MOVEMENT_POSES.map(pose => {
        const seconds = Math.round((DATASET_DEMOS[pose.name]?.durationMs ?? 0) / 1000);
        return <TouchableOpacity key={pose.name} accessibilityRole="button" accessibilityLabel={`Watch ${pose.name}, ${pose.subtitle} demonstration`}
          activeOpacity={0.85} style={[demoStyles.card, demoStyles.row, styles.card]}
          onPress={() => router.push({ pathname: "/demo/pose", params: { pose: pose.name } })}>
          <View style={demoStyles.iconButton}><Feather name="play-circle" size={24} color={colors.accent} /></View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{pose.name}</Text>
            <Text style={styles.cardDetail}>{pose.subtitle}{seconds > 0 ? ` · ${seconds} s video` : ""}</Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.accent} />
        </TouchableOpacity>;
      })}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ header: { gap: 8 }, card: { padding: 18 }, cardText: { flex: 1, gap: 2 }, cardTitle: { color: colors.text, fontSize: 20, fontWeight: "800" }, cardDetail: { color: colors.muted, fontSize: 15 } });
