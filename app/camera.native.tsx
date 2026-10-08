import React, { useState } from "react";
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from "react-native-vision-camera";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import PoseCanvas from "../src/components/PoseCanvas";
import { usePoseDetection } from "../src/hooks/usePoseDetection";
import { useCameraActive } from "../src/hooks/useCameraActive";
import { useGuidedPractice } from "../src/hooks/useGuidedPractice";
import { PRACTICE_POSES } from "../src/services/practiceEvaluator";
import { HOLD_MS } from "../src/services/practiceSession";

export default function CameraScreen() {
  const device = useCameraDevice("front");
  const focused = useCameraActive();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [paused, setPaused] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } }, { fps: 30 },
  ]);
  const fps = format ? Math.max(format.minFps, Math.min(30, format.maxFps)) : undefined;
  const sourceAspect = format ? Math.min(format.videoWidth, format.videoHeight) / Math.max(format.videoWidth, format.videoHeight) : 3 / 4;
  const { poseResult, frameProcessor, cameraViewLayoutChangeHandler } = usePoseDetection();
  const active = focused && !paused && hasPermission && !!device && !cameraError;
  const { session, restart, evaluation, message, now, fresh } = useGuidedPractice(poseResult, active);
  const pose = PRACTICE_POSES[session.poseIndex];
  const exit = () => router.dismissTo("/practice-mode");

  if (!hasPermission || !device || cameraError) return <SafeAreaView style={styles.screen}>
    <View style={styles.center}>
      <Text style={styles.title}>{cameraError ?? (!hasPermission ? "Camera access needed" : "Front camera unavailable")}</Text>
      <Text style={styles.description}>Guided practice needs the front camera to check your posture.</Text>
      {!hasPermission && <>
        <Action label="Allow camera" onPress={() => { void requestPermission(); }} />
        <Action label="Open settings" onPress={() => { void Linking.openSettings(); }} secondary />
      </>}
      {cameraError && <Action label="Retry camera" onPress={() => { setCameraError(null); setCameraKey(k => k + 1); restart(); }} />}
      <Action label="Back to practice modes" onPress={exit} secondary />
    </View>
  </SafeAreaView>;

  if (session.phase === "complete") return <SafeAreaView style={styles.screen}>
    <View style={styles.center}>
      <Text style={styles.eyebrow}>PRACTICE COMPLETE</Text>
      <Text style={styles.title}>Two poses, well practiced</Text>
      <Text style={styles.description}>You held Prayer Pose and Raised Arms for five seconds each. This practice covers the first two standing positions.</Text>
      <Action label="Practice again" onPress={restart} />
      <Action label="Back to practice modes" onPress={exit} secondary />
    </View>
  </SafeAreaView>;

  const status = !active ? "Practice paused" : session.phase === "prepare"
    ? `Get ready · ${Math.max(1, Math.ceil((session.until - now) / 1000))}`
    : session.phase === "success" ? "Pose held successfully!" : message;
  const good = active && (session.phase === "success" || (session.phase === "holding" && evaluation.ready && fresh));

  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>GUIDED PRACTICE · {session.poseIndex + 1} / {PRACTICE_POSES.length}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={exit}><Text style={styles.link}>Exit</Text></TouchableOpacity>
      </View>
      <Text style={styles.title}>{pose.name}</Text>
      <Text style={styles.description}>{pose.instruction}</Text>
      <View style={styles.camera}>
        <Camera key={cameraKey} style={StyleSheet.absoluteFill} device={device} isActive={active}
          format={format} fps={fps} pixelFormat="rgb" resizeMode="contain"
          frameProcessor={frameProcessor} onLayout={cameraViewLayoutChangeHandler}
          onError={() => setCameraError("Camera could not start")}
        />
        {active && fresh && poseResult.landmarks.length >= 33 && <PoseCanvas landmarks={poseResult.landmarks} sourceAspect={sourceAspect} />}
        {!active && <View style={styles.pauseOverlay}><Text style={styles.pauseText}>Paused</Text></View>}
      </View>
      <View style={[styles.feedback, good && styles.good]} accessibilityLiveRegion="polite">
        <Text style={styles.feedbackText}>{status}</Text>
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 5, now: session.heldMs / 1000 }} style={styles.track}>
        <View style={[styles.progress, { width: `${session.heldMs / HOLD_MS * 100}%` }]} />
      </View>
      <Text style={styles.hold}>{(session.heldMs / 1000).toFixed(1)} / 5 seconds held</Text>
      <Text style={styles.note}>{session.phase === "success" ? "Moving to the next step…" : "Hold steadily. A correction or loss of tracking restarts the hold."}</Text>
      <View style={styles.actions}>
        <View style={styles.flex}><Action label={paused ? "Resume" : "Pause"} onPress={() => setPaused(value => !value)} /></View>
        <View style={styles.flex}><Action label="Restart" onPress={() => { restart(); setPaused(false); }} secondary /></View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Action({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.button, secondary && styles.secondary]}>
    <Text style={[styles.buttonText, secondary && styles.link]}>{label}</Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F5EE" },
  content: { padding: 18, gap: 12, paddingBottom: 30 },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: "#276652", fontWeight: "700", fontSize: 12 },
  title: { color: "#172923", fontWeight: "700", fontSize: 28 },
  description: { color: "#53665C", fontSize: 16, lineHeight: 23 },
  camera: { width: "100%", aspectRatio: 3 / 4, borderRadius: 20, overflow: "hidden", backgroundColor: "#111" },
  feedback: { backgroundColor: "#FFF0D9", borderRadius: 14, padding: 16, minHeight: 56, justifyContent: "center" },
  good: { backgroundColor: "#DCEBE4" },
  feedbackText: { color: "#172923", fontSize: 17, fontWeight: "600", textAlign: "center" },
  track: { height: 8, borderRadius: 4, backgroundColor: "#DFE4DB", overflow: "hidden" },
  progress: { height: "100%", backgroundColor: "#276652" },
  hold: { textAlign: "center", color: "#172923", fontSize: 18, fontVariant: ["tabular-nums"] },
  note: { color: "#53665C", fontSize: 13, textAlign: "center", lineHeight: 18 },
  actions: { flexDirection: "row", gap: 12 }, flex: { flex: 1 },
  button: { padding: 16, backgroundColor: "#276652", borderRadius: 14, alignItems: "center" },
  secondary: { backgroundColor: "#E4EBE3" },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 }, link: { color: "#276652", fontWeight: "700" },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#0009" },
  pauseText: { color: "white", fontSize: 24, fontWeight: "700" },
});
