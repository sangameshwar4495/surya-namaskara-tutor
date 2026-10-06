import { useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DemoNavigation from "../../src/components/demo/DemoNavigation";
import KeyPoints from "../../src/components/demo/KeyPoints";
import PoseMedia from "../../src/components/demo/PoseMedia";
import PoseProgress from "../../src/components/demo/PoseProgress";
import { colors, demoStyles } from "../../src/components/demo/styles";
import { poses } from "../../src/data/poses";

export default function PoseDemoScreen() {
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const pose = poses[currentPoseIndex];
  const isLast = currentPoseIndex === poses.length - 1;

  function changePose(direction: number) {
    setCurrentPoseIndex(index => Math.max(0, Math.min(poses.length - 1, index + direction)));
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return <SafeAreaView style={demoStyles.screen}>
    <ScrollView ref={scroll} contentContainerStyle={demoStyles.content}>
      <View style={demoStyles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to sequence overview" style={demoStyles.iconButton} onPress={() => router.dismissTo("/demo")}><Feather name="arrow-left" size={22} color={colors.accent} /></TouchableOpacity>
        <PoseProgress current={currentPoseIndex + 1} total={poses.length} />
      </View>
      <View style={demoStyles.row}>
        <View style={{ flex: 1, gap: 8 }} accessibilityLiveRegion="polite"><Text style={demoStyles.title}>{pose.name}</Text><Text style={demoStyles.subtitle}>{pose.subtitle}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Audio guidance coming soon" accessibilityState={{ disabled: true }} disabled style={demoStyles.iconButton}><Feather name="volume-2" size={22} color={colors.accent} /></TouchableOpacity>
      </View>
      <PoseMedia key={pose.id} media={pose.media} name={pose.name} duration={pose.duration} />
      <KeyPoints points={pose.keyPoints} />
      <DemoNavigation isFirst={currentPoseIndex === 0} isLast={isLast} onPrevious={() => changePose(-1)} onNext={() => isLast ? router.dismissTo("/practice-mode") : changePose(1)} />
    </ScrollView>
  </SafeAreaView>;
}
