import { useEffect, useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DemoNavigation from "../../src/components/demo/DemoNavigation";
import DemoVideo from "../../src/components/demo/DemoVideo";
import KeyPoints from "../../src/components/demo/KeyPoints";
import { colors, demoStyles } from "../../src/components/demo/styles";
import { DATASET_DEMOS } from "../../src/data/datasetDemos";
import { KEY_POINT_SOURCE, keyPointNarration, MOVEMENT_POSES } from "../../src/data/movementPoses";
import { useCameraActive } from "../../src/hooks/useCameraActive";
import { useCoachSpeech } from "../../src/hooks/useCoachSpeech";

export default function PoseDemoScreen() {
  const { pose: selected } = useLocalSearchParams<{ pose?: string }>();
  const scroll = useRef<ScrollView>(null);
  // Narration only while this screen is visible and the app is in the foreground.
  const visible = useCameraActive();
  const speech = useCoachSpeech(visible);
  const currentPoseIndex = MOVEMENT_POSES.findIndex(p => p.name === selected);
  const pose = MOVEMENT_POSES[currentPoseIndex];
  const narration = pose ? keyPointNarration(pose) : "";
  const { speak, stop, enabled } = speech;

  // Read the key points aloud when a pose opens or the screen returns to view, and again when
  // voice is turned back on. (Focus is reported after the first render, hence `visible`.)
  useEffect(() => {
    if (!narration || !enabled || !visible) return;
    void speak(narration);
    return stop;
  }, [narration, enabled, visible, speak, stop]);

  if (!pose) return <Redirect href="/demo" />;
  const demo = DATASET_DEMOS[pose.name];
  const isLast = currentPoseIndex === MOVEMENT_POSES.length - 1;

  function changePose(direction: number) {
    const target = MOVEMENT_POSES[Math.max(0, Math.min(MOVEMENT_POSES.length - 1, currentPoseIndex + direction))];
    router.setParams({ pose: target.name });
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return <SafeAreaView style={demoStyles.screen}>
    <ScrollView ref={scroll} contentContainerStyle={demoStyles.content}>
      <View style={demoStyles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to pose demos" style={demoStyles.iconButton} onPress={() => router.dismissTo("/demo")}><Feather name="arrow-left" size={22} color={colors.accent} /></TouchableOpacity>
      </View>
      <View style={demoStyles.row}>
        <View style={{ flex: 1, gap: 8 }} accessibilityLiveRegion="polite"><Text style={demoStyles.title}>{pose.name}</Text><Text style={demoStyles.subtitle}>{pose.subtitle}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Read the key points aloud again" accessibilityState={{ disabled: !enabled }} disabled={!enabled}
          style={[demoStyles.iconButton, !enabled && { opacity: 0.45 }]} onPress={() => void speak(narration)}><Feather name="rotate-ccw" size={22} color={colors.accent} /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={enabled ? "Mute voice guidance" : "Turn voice guidance on"} style={demoStyles.iconButton}
          onPress={() => speech.setEnabled(v => !v)}><Feather name={enabled ? "volume-2" : "volume-x"} size={22} color={colors.accent} /></TouchableOpacity>
      </View>
      {demo ? <DemoVideo key={pose.name} source={demo.source} name={pose.name} durationMs={demo.durationMs} aspectRatio={demo.aspectRatio} />
        : <Text style={demoStyles.subtitle}>Demonstration video unavailable for this pose.</Text>}
      {!!speech.error && <Text style={demoStyles.subtitle}>{speech.error}</Text>}
      <KeyPoints points={pose.keyPoints} cautions={pose.cautions}
        source={`Source: ${KEY_POINT_SOURCE.title} (${pose.sourceName}), ${KEY_POINT_SOURCE.publisher}, ${KEY_POINT_SOURCE.edition}, ${pose.sourcePages}.`} />
      <DemoNavigation isFirst={currentPoseIndex === 0} isLast={isLast} onPrevious={() => changePose(-1)} onNext={() => isLast ? router.dismissTo("/demo") : changePose(1)} />
    </ScrollView>
  </SafeAreaView>;
}
