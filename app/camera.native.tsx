import React, { useState } from "react";
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from "react-native-vision-camera";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import PoseCanvas from "../src/components/PoseCanvas";
import TargetPoseOverlay from "../src/components/TargetPoseOverlay";
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
  const { session, restart, changeStep, evaluation, message, now, fresh, framing } = useGuidedPractice(poseResult, active);
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
      <Text style={styles.title}>Sequence finished</Text>
      <Text style={styles.description}>{Object.values(session.outcomes).filter(value => value === "verified").length} / {PRACTICE_POSES.length} steps passed available camera checks. {Object.values(session.outcomes).filter(value => value === "manual").length} manually continued; {Object.values(session.outcomes).filter(value => value === "skipped").length} skipped.</Text>
      <Text style={styles.note}>Camera checks are geometric guidance, not a complete assessment of pose accuracy.</Text>
      <Action label="Practice again" onPress={restart} />
      <Action label="Back to practice modes" onPress={exit} secondary />
    </View>
  </SafeAreaView>;

  const setup = session.phase === "setup";
  const cameraCheck = !session.cameraChecked;
  const preparing = session.phase === "prepare";
  const countdown = Math.max(1, Math.ceil((session.until - now) / 1000));
  const framed = active && fresh && framing.inFrame;
  const status = !active ? "Practice paused" : setup
    ? !fresh ? "Waiting for camera tracking…" : framed ? "Full body visible — hold still for a moment" : framing.message
    : session.phase === "prepare"
    ? `Get ready · ${Math.max(1, Math.ceil((session.until - now) / 1000))}`
    : session.phase === "success" ? "Hold complete!" : session.phase === "manual" ? pose.coverage : message;
  const manual = session.phase === "manual";
  const good = active && (session.phase === "success" || (session.phase === "holding" && evaluation.ready && fresh));

  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{cameraCheck ? "CAMERA CHECK" : `${session.poseIndex + 1} / ${PRACTICE_POSES.length}`}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={exit}><Text style={styles.link}>Exit</Text></TouchableOpacity>
      </View>
      <Text style={styles.title}>{cameraCheck ? "Set up your camera" : `${pose.name} (${pose.subtitle})`}</Text>
      <Text style={styles.description}>{cameraCheck ? "Face the camera and step back until your head, hands and both feet are visible. Stay in frame for the 3-second countdown; practice starts automatically." : pose.keyPoints[0]}</Text>
      {pose.manual && <Text style={styles.note}>Manual guidance · no camera verification</Text>}
      <View style={styles.camera}>
        <Camera key={cameraKey} style={StyleSheet.absoluteFill} device={device} isActive={active}
          format={format} fps={fps} pixelFormat="rgb" resizeMode="contain"
          frameProcessor={frameProcessor} onLayout={cameraViewLayoutChangeHandler}
          onError={() => setCameraError("Camera could not start")}
        />
        <TargetPoseOverlay poseIndex={session.poseIndex} sourceAspect={sourceAspect} setup={cameraCheck || setup} framed={framed} />
        {active && fresh && poseResult.landmarks.length >= 33 && <PoseCanvas landmarks={poseResult.landmarks} sourceAspect={sourceAspect} />}
        {active && preparing && <View pointerEvents="none" style={styles.countdownOverlay}>
          <Text style={styles.countdown}>{countdown}</Text>
          <Text style={styles.countdownLabel}>Get ready</Text>
        </View>}
        <View pointerEvents="none" style={styles.angleOverlay}>
          <Text style={styles.angleText}>{pose.cameraLabel}</Text>
          <Text style={styles.guideText}>{cameraCheck ? "Keep your full body inside the guide" : `${pose.guideLabel}${pose.frontLeg ? ` · ${pose.frontLeg} leg forward` : ""}`}</Text>
        </View>
        {!active && <View style={styles.pauseOverlay}><Text style={styles.pauseText}>Paused</Text></View>}
      </View>
      <View style={[styles.feedback, good && styles.good]} accessibilityLiveRegion="polite">
        <Text style={styles.feedbackText}>{status}</Text>
      </View>
      {!pose.manual && !setup && !preparing && <><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 5, now: session.heldMs / 1000 }} style={styles.track}>
        <View style={[styles.progress, { width: `${session.heldMs / HOLD_MS * 100}%` }]} />
      </View>
      <Text style={styles.hold}>{(session.heldMs / 1000).toFixed(1)} / 5 seconds held{active && session.phase === "holding" && (!fresh || !evaluation.ready) ? " · paused" : ""}</Text></>}
      {manual && <Text style={styles.note}>Continue when ready. This step is recorded as manual.</Text>}
      {manual && <Action label="Continue without camera verification" onPress={() => changeStep(1, true)} disabled={!active} />}
      {!cameraCheck && <View style={styles.actions}>
        <View style={styles.flex}><Action label="Previous pose" onPress={() => changeStep(-1)} disabled={session.poseIndex === 0 || session.phase === "success"} secondary /></View>
        <View style={styles.flex}><Action label={session.poseIndex === PRACTICE_POSES.length - 1 ? "Skip and finish" : "Skip pose"} onPress={() => changeStep(1)} disabled={session.phase === "success"} secondary /></View>
      </View>}
      <View style={styles.actions}>
        <View style={styles.flex}><Action label={paused ? "Resume" : "Pause"} onPress={() => setPaused(value => !value)} /></View>
        <View style={styles.flex}><Action label="Restart" onPress={() => { restart(); setPaused(false); }} secondary /></View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Action({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && { opacity: 0.4 }]}>
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
  angleOverlay: { position: "absolute", top: 10, left: 10, right: 10, borderRadius: 10, padding: 10, backgroundColor: "#172923DD" },
  angleText: { color: "white", fontWeight: "700", textAlign: "center", fontSize: 13 },
  guideText: { color: "#E4EBE3", textAlign: "center", fontSize: 11, marginTop: 3 },
  countdownOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  countdown: { color: "white", fontSize: 80, fontWeight: "800", textShadowColor: "#000", textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  countdownLabel: { color: "white", backgroundColor: "#172923CC", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, fontSize: 18 },
});
