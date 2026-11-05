import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';
import { router } from 'expo-router';
import { useCameraActive } from '../src/hooks/useCameraActive';
import { usePoseDetection } from '../src/hooks/usePoseDetection';
import PoseCanvas from '../src/components/PoseCanvas';
import { FEATURES, FINAL_HOLD_MS, validateModel, type TemporalModel } from '../src/services/temporalPose';
import { ContinuousPractice, type ContinuousResult } from '../src/services/continuousPractice';
import { highlightedJoints, MOVEMENT_SETUP } from '../src/services/learnedGuidance';
import { useCoachSpeech } from '../src/hooks/useCoachSpeech';
import MovementDemo from '../src/components/MovementDemo';
import { DATASET_DEMOS, DEMO_MODEL_KEY } from '../src/data/datasetDemos';
import artifact from '../src/data/temporalModel.json';

const model: TemporalModel = artifact;
let modelError = '';
try { validateModel(model); } catch { modelError = 'Model file is invalid. Rebuild it with the training pipeline.'; }
const JOINTS = [[23,25,27],[24,26,28],[11,13,15],[12,14,16],[13,11,23],[14,12,24],[11,23,25],[12,24,26]];
const COUNTDOWN_MS = 3000;
/** Pause after the spoken summary before moving on; longer when the summary must be read. */
const ADVANCE_AFTER_SPEECH_MS = 3000;
const ADVANCE_AFTER_READING_MS = 8000;
/** Some TTS engines never report completion; never let that block practice. */
const INTRO_FALLBACK_MS = 12000;

export default function DatasetPractice() {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('front');
  const format = useCameraFormat(device, [{ videoResolution: { width: 640, height: 480 } }, { fps: 30 }]);
  const fps = format ? Math.max(format.minFps, Math.min(30, format.maxFps)) : undefined;
  const sourceAspect = format ? Math.min(format.videoWidth, format.videoHeight) / Math.max(format.videoWidth, format.videoHeight) : 3/4;
  const { hasPermission, requestPermission } = useCameraPermission();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const focused = useCameraActive();
  const speech = useCoachSpeech(focused);
  const { poseResult, frameProcessor, cameraViewLayoutChangeHandler } = usePoseDetection();
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraKey, setCameraKey] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [feedback, setFeedback] = useState<ContinuousResult | null>(null);
  const [advanceAt, setAdvanceAt] = useState<number | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(performance.now());
  const readyAt = useRef(Infinity);
  const holdAnnounced = useRef(false);
  // Identifies the completion allowed to auto-advance; Stay/Repeat/Replay/navigation revoke it,
  // so a narration cancelled by those actions can never schedule a late advance.
  const advanceToken = useRef(0);
  const name = model.sequence[index];
  const isLast = index === model.sequence.length - 1;
  const nextName = model.sequence[index + 1];
  const pose = model.poses.find(p => p.name === name);
  const tracker = useMemo(() => pose ? new ContinuousPractice(pose) : null, [pose, attempt]);
  const demo = model.referenceKey === DEMO_MODEL_KEY ? DATASET_DEMOS[name] : undefined;
  // The preview runs before Start so people can frame themselves; scoring starts on Start.
  const previewOn = focused && hasPermission && !!device && !cameraError;
  const active = previewOn && !paused && !!tracker && !modelError;
  const expanded = !paused;

  // Introduction, then a short countdown. Scoring ignores frames until the countdown ends.
  useEffect(() => {
    let cancelled = false;
    readyAt.current = Infinity;
    holdAnnounced.current = false;
    advanceToken.current++;
    tracker?.reset(); setFeedback(null); setCompleted(false); setAdvanceAt(null);
    const beginCountdown = () => {
      if (!cancelled && readyAt.current === Infinity) readyAt.current = performance.now() + COUNTDOWN_MS;
    };
    let fallback: ReturnType<typeof setTimeout> | undefined;
    if (active) {
      void speech.speak(`${name}. ${MOVEMENT_SETUP[name] ?? ''}`).then(beginCountdown);
      fallback = setTimeout(beginCountdown, INTRO_FALLBACK_MS);
    } else speech.stop();
    return () => { cancelled = true; clearTimeout(fallback); speech.stop(); };
  }, [active, tracker, name, speech.speak, speech.stop]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  const summarySpeech = useCallback((result: ContinuousResult) =>
    `${result.summary?.speech ?? ''} ${isLast ? 'That completes your practice.' : `Next: ${nextName}.`}`, [isLast, nextName]);

  useEffect(() => {
    if (!active || !tracker || completed || poseResult.receivedAt <= readyAt.current || performance.now() - poseResult.receivedAt > 500) return;
    const angles = {...poseResult.angles};
    FEATURES.forEach((key,k) => {
      if (!JOINTS[k].every(i => {
        const p = poseResult.landmarks[i];
        return p && p.visibility >= .6 && p.x > .02 && p.x < .98 && p.y > .02 && p.y < .98;
      })) angles[key] = null;
    });
    const next = tracker.update(angles, poseResult.receivedAt);
    setFeedback(next);
    if (next.status === 'complete') {
      setCompleted(true);
      // Move on automatically once the review has been heard (or had time to be read).
      const token = ++advanceToken.current;
      void speech.speak(summarySpeech(next)).then(spoken => {
        if (!isLast && token === advanceToken.current)
          setAdvanceAt(performance.now() + (spoken ? ADVANCE_AFTER_SPEECH_MS : ADVANCE_AFTER_READING_MS));
      });
    } else if (next.heldMs >= 250 && !holdAnnounced.current) {
      holdAnnounced.current = true;
      void speech.speak('Hold steady and breathe.');
    }
  }, [active, tracker, poseResult, completed, speech.speak, summarySpeech, isLast]);

  const cancelAdvance = useCallback(() => { advanceToken.current++; setAdvanceAt(null); }, []);
  const goTo = useCallback((target: number, start: boolean) => {
    cancelAdvance(); speech.stop(); setFeedback(null); setCompleted(false);
    setIndex(target); setAttempt(v => v + 1); setPaused(!start);
  }, [speech.stop, cancelAdvance]);
  useEffect(() => {
    if (advanceAt !== null && completed && now >= advanceAt) goTo(index + 1, true);
  }, [advanceAt, completed, now, index, goTo]);

  const stale = now - poseResult.receivedAt > 1000;
  const fresh = previewOn && now - poseResult.receivedAt <= 500;
  const introducing = active && readyAt.current === Infinity;
  const countingDown = active && !introducing && now < readyAt.current;
  const scoring = active && !introducing && !countingDown && !stale;
  const final = !!pose && !!feedback && feedback.phase === pose.phases.length - 1;
  const good = scoring && !completed && feedback?.status === 'matching';
  const highlight = scoring && !completed ? highlightedJoints(feedback) : [];
  const held = completed ? FINAL_HOLD_MS : scoring ? feedback?.heldMs ?? 0 : 0;
  const status = introducing ? MOVEMENT_SETUP[name]
    : countingDown ? 'Get ready.'
    : stale ? 'Step into view — keep your whole body visible.'
    : feedback?.message ?? 'Begin with the demonstration.';
  const secondsToAdvance = advanceAt === null ? null : Math.max(1, Math.ceil((advanceAt - now) / 1000));

  // A pose result also proves frames are flowing, in case a device never reports initialization.
  const cameraState = !hasPermission ? 'permission' : !device ? 'missing' : cameraError ? 'error' : !(cameraReady || fresh) ? 'loading' : 'ready';
  const cameraUsable = cameraState === 'ready' || cameraState === 'loading';

  return <View style={[styles.screen, expanded && styles.screenExpanded, { paddingTop: insets.top }]}>
    <StatusBar hidden={expanded} style={expanded ? 'light' : 'dark'} />
    {!expanded && <View style={styles.header}>
      <View style={styles.row}>
        <IconButton icon="x" label="Exit practice" onPress={() => router.back()} />
        <View style={styles.stepper}>
          <IconButton icon="chevron-left" label="Previous pose" disabled={index === 0} onPress={() => goTo(index - 1, false)} />
          <Text style={styles.step}>{index + 1} / {model.sequence.length}</Text>
          <IconButton icon="chevron-right" label="Next pose" disabled={isLast} onPress={() => goTo(index + 1, false)} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">{name}</Text>
      <Text style={styles.description}>{MOVEMENT_SETUP[name]}</Text>
    </View>}

    <View style={[styles.stage, expanded ? { width: '100%', aspectRatio: sourceAspect, flexShrink: 1 } : styles.stageCard]}
      onLayout={e => setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {device && hasPermission && !cameraError && <Camera key={cameraKey} style={StyleSheet.absoluteFill} device={device} isActive={previewOn}
        format={format} fps={fps} resizeMode="contain" pixelFormat="rgb" frameProcessor={frameProcessor}
        onLayout={cameraViewLayoutChangeHandler} onInitialized={() => setCameraReady(true)}
        onError={e => { setCameraError(e.message); setCameraReady(false); setPaused(true); }} />}
      {fresh && poseResult.landmarks.length >= 33 && <PoseCanvas landmarks={poseResult.landmarks}
        sourceAspect={sourceAspect} highlightIndices={highlight} minVisibility={.6} />}
      {cameraState !== 'ready' && <View style={styles.cameraMessage}>
        {cameraState === 'loading' && <><ActivityIndicator color="white" /><Text style={styles.cameraText}>Starting camera…</Text></>}
        {cameraState === 'missing' && <Text style={styles.cameraText}>No front camera was found on this device.</Text>}
        {cameraState === 'permission' && <>
          <Text style={styles.cameraText}>Camera access is needed to follow your movement.</Text>
          <Pill label={permissionDenied ? 'Open settings' : 'Allow camera'} onPress={() => {
            if (permissionDenied) void Linking.openSettings();
            else void requestPermission().then(granted => setPermissionDenied(!granted));
          }} />
        </>}
        {cameraState === 'error' && <>
          <Text style={styles.cameraText}>The camera stopped: {cameraError}</Text>
          <Pill label="Try again" onPress={() => { setCameraError(''); setCameraReady(false); setCameraKey(v => v + 1); }} />
        </>}
      </View>}
      {countingDown && <View pointerEvents="none" style={styles.countdown}>
        <Text style={styles.countdownText}>{Math.max(1, Math.ceil((readyAt.current - now) / 1000))}</Text>
      </View>}
      {demo && cameraUsable && <MovementDemo key={name} source={demo.source} aspectRatio={demo.aspectRatio}
        frame={stage} playing={active && !introducing && !completed} />}
    </View>

    <View style={[styles.panel, expanded && styles.panelExpanded, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {!expanded ? <>
        {!!modelError && <Text style={styles.note}>{modelError}</Text>}
        {!demo && <Text style={styles.note}>Demonstration unavailable for this model.</Text>}
        <View style={styles.row}>
          <Button label="Start movement" icon="play" onPress={() => { setCameraError(''); setPaused(false); }}
            disabled={!pose || !!modelError || !cameraUsable} />
          <IconButton icon={speech.enabled ? 'volume-2' : 'volume-x'} label={speech.enabled ? 'Mute voice' : 'Turn voice on'} onPress={() => speech.setEnabled(v => !v)} />
        </View>
        <Text style={styles.note}>Experimental guidance, not medical advice.</Text>
      </> : completed && feedback?.summary ? <>
        <View style={styles.row}>
          <Text style={styles.panelTitle}>{isLast ? 'Practice complete' : `${name} complete`}</Text>
          <View style={styles.actions}>
            <IconButton icon="play-circle" label="Replay spoken summary" disabled={!speech.enabled}
              onPress={() => { cancelAdvance(); void speech.speak(summarySpeech(feedback)); }} />
            <IconButton icon={speech.enabled ? 'volume-2' : 'volume-x'} label={speech.enabled ? 'Mute voice' : 'Turn voice on'} onPress={() => speech.setEnabled(v => !v)} />
          </View>
        </View>
        <ScrollView style={styles.summary} contentContainerStyle={{ gap: 6 }}>
          {feedback.summary.corrections.length ? feedback.summary.corrections.map((text, i) => <Text key={i} style={styles.summaryText}>• {text}</Text>)
            : <Text style={styles.summaryText}>{feedback.summary.verified ? 'Your movement matched the reference throughout.' : 'Final pose held.'}</Text>}
          {feedback.summary.missing.length > 0 && <Text style={styles.summaryMuted}>Part of the movement was not clearly seen.</Text>}
          {feedback.summary.trackingInterrupted && <Text style={styles.summaryMuted}>The camera briefly lost sight of you.</Text>}
        </ScrollView>
        {secondsToAdvance !== null && <Text style={styles.advance} accessibilityLiveRegion="polite">Next: {nextName} in {secondsToAdvance} s</Text>}
        <View style={styles.row}>
          <Button label="Repeat" icon="rotate-ccw" secondary onPress={() => goTo(index, true)} />
          {isLast ? <Button label="Done" icon="check" onPress={() => { speech.stop(); router.back(); }} />
            : advanceAt === null ? <Button label={`Next: ${nextName}`} icon="arrow-right" onPress={() => goTo(index + 1, true)} />
            : <Button label="Stay here" icon="pause" secondary onPress={() => { cancelAdvance(); speech.stop(); }} />}
        </View>
        {isLast && <Button label="Start again from the first pose" secondary onPress={() => goTo(0, false)} />}
      </> : <>
        <View style={styles.row}>
          <Text style={styles.panelTitle} numberOfLines={1}>{name} <Text style={styles.step}>{index + 1}/{model.sequence.length}</Text></Text>
          <View style={styles.actions}>
            <IconButton icon={speech.enabled ? 'volume-2' : 'volume-x'} label={speech.enabled ? 'Mute voice' : 'Turn voice on'} onPress={() => speech.setEnabled(v => !v)} />
            <IconButton icon="rotate-ccw" label="Restart this pose" onPress={() => goTo(index, true)} />
            <IconButton icon="pause" label="Pause and leave full screen" onPress={() => { speech.stop(); setPaused(true); }} />
          </View>
        </View>
        <View style={[styles.feedback, good && styles.good, !scoring && styles.neutral]} accessibilityLiveRegion="polite">
          <Text style={styles.status} numberOfLines={2}>{status}</Text>
        </View>
        {final && scoring && <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Final pose hold"
          accessibilityValue={{ min: 0, max: FINAL_HOLD_MS / 1000, now: held / 1000 }}>
          <View style={[styles.progress, { width: `${held / FINAL_HOLD_MS * 100}%` }]} />
        </View>}
      </>}
      {!!speech.error && <Text style={styles.note}>{speech.error}</Text>}
    </View>
  </View>;
}

function Button({ label, onPress, icon, disabled = false, secondary = false }: { label: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]} onPress={onPress}>
    {icon && <Feather name={icon} size={18} color={secondary ? '#276652' : 'white'} />}
    <Text style={[styles.buttonText, secondary && styles.link]} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>;
}
function IconButton({ icon, label, onPress, disabled = false }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    hitSlop={8} style={[styles.iconButton, disabled && styles.disabled]} onPress={onPress}>
    <Feather name={icon} size={20} color="#276652" />
  </TouchableOpacity>;
}
function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" style={styles.pill} onPress={onPress}><Text style={styles.pillText}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F5EE' },
  screenExpanded: { backgroundColor: '#000' },
  header: { paddingHorizontal: 16, paddingBottom: 10, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { color: '#52665e', fontSize: 13, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: '#172923' },
  description: { color: '#53665C', fontSize: 15, lineHeight: 21 },
  stage: { backgroundColor: '#111', overflow: 'hidden', alignSelf: 'center' },
  stageCard: { flex: 1, alignSelf: 'stretch', marginHorizontal: 16, borderRadius: 18, minHeight: 220 },
  cameraMessage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  cameraText: { color: 'white', textAlign: 'center', fontSize: 15, lineHeight: 21 },
  countdown: { position: 'absolute', top: 12, alignSelf: 'center', minWidth: 48, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 24, backgroundColor: '#172923CC' },
  countdownText: { color: 'white', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  panel: { paddingHorizontal: 16, paddingTop: 12, gap: 10, backgroundColor: '#F7F5EE' },
  panelExpanded: { flexGrow: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  panelTitle: { flexShrink: 1, fontSize: 19, fontWeight: '700', color: '#172923' },
  feedback: { backgroundColor: '#FFF0D9', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, minHeight: 52, justifyContent: 'center' },
  good: { backgroundColor: '#DCEBE4' }, neutral: { backgroundColor: '#ECEFE8' },
  status: { fontSize: 16, fontWeight: '600', textAlign: 'center', color: '#172923' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#DFE4DB', overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: '#276652' },
  summary: { maxHeight: 150 },
  summaryText: { color: '#172923', fontSize: 15, lineHeight: 21 },
  summaryMuted: { color: '#52665e', fontSize: 14, lineHeight: 20 },
  advance: { color: '#276652', fontWeight: '700', textAlign: 'center' },
  note: { color: '#52665e', fontSize: 12, textAlign: 'center' },
  button: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#276652', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14 },
  secondary: { backgroundColor: '#E4EBE3' },
  disabled: { opacity: .45 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 15 },
  link: { color: '#276652' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4EBE3' },
  pill: { backgroundColor: 'white', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  pillText: { color: '#172923', fontWeight: '700' },
});
