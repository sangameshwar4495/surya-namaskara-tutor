import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PoseIllustration from "../../src/components/demo/PoseIllustration";
import { colors, demoStyles } from "../../src/components/demo/styles";
import { poses } from "../../src/data/poses";

export default function DemoIntroScreen() {
  return <SafeAreaView style={demoStyles.screen}>
    <ScrollView contentContainerStyle={demoStyles.content}>
      <View style={demoStyles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Practice Mode" style={demoStyles.iconButton} onPress={() => router.dismissTo("/practice-mode")}><Feather name="arrow-left" size={22} color={colors.accent} /></TouchableOpacity>
        <Text style={demoStyles.eyebrow}>READY TO BEGIN</Text>
      </View>
      <View style={styles.header}><Text style={demoStyles.title}>Surya Namaskar</Text><Text style={styles.subtitle}>12 Poses in Harmony</Text></View>
      <Text style={demoStyles.subtitle}>Watch the complete sequence to see how all 12 poses flow together with correct form and timing.</Text>
      <View style={[demoStyles.card, styles.overview]}>
        <Text style={demoStyles.eyebrow}>THE COMPLETE SEQUENCE</Text>
        <View style={styles.grid}>{poses.map(pose => <View key={pose.id} style={styles.tile} accessible accessibilityLabel={`${pose.id}. ${pose.name}, ${pose.subtitle}`}>
          <View style={styles.figure}>{pose.media.kind === "illustration" && <PoseIllustration illustration={pose.media.illustration} />}</View>
          <Text style={styles.caption}>{pose.id}. {pose.subtitle}</Text>
        </View>)}</View>
      </View>
      <View style={[demoStyles.card, styles.info]}>
        {[["clock", "~ 3 minutes", "Complete sequence"], ["grid", "12 poses", "Guided flow"], ["sun", "Ideal for", "Learning correct form"]].map(([icon, title, detail]) => <View key={title} style={demoStyles.row}>
          <View style={demoStyles.iconButton}><Feather name={icon as "clock" | "grid" | "sun"} size={22} color={colors.accent} /></View>
          <View style={styles.infoText}><Text style={styles.infoTitle}>{title}</Text><Text style={demoStyles.subtitle}>{detail}</Text></View>
        </View>)}
      </View>
      <TouchableOpacity accessibilityRole="button" style={demoStyles.primary} onPress={() => router.push("/demo/pose")}><Text style={demoStyles.buttonText}>Start Demo →</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ header: { gap: 8 }, subtitle: { fontSize: 22, color: colors.accent, fontWeight: "500" }, overview: { padding: 18, gap: 18 }, grid: { flexDirection: "row", flexWrap: "wrap" }, tile: { width: "33.333%", padding: 4, alignItems: "center", marginBottom: 12 }, figure: { width: "100%", aspectRatio: 1, backgroundColor: "#EEF3EE", borderRadius: 16 }, caption: { fontSize: 11, lineHeight: 15, color: colors.muted, textAlign: "center", marginTop: 6 }, info: { gap: 18 }, infoText: { flex: 1 }, infoTitle: { color: colors.text, fontSize: 17, fontWeight: "700" } });
