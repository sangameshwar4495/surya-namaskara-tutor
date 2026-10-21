import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseDetectionResult } from "../types/pose";
import { tracking, PRACTICE_POSES, type Evaluation } from "../services/practiceEvaluator";
import { PracticeMeasurements } from "../services/practiceMeasurements";
import { practiceFraming } from "../services/practiceFraming";
import { MAX_SAMPLE_GAP_MS, sampleSession, startSession, tickSession, resetStep, navigateSession, confirmManual } from "../services/practiceSession";

export function useGuidedPractice(result: PoseDetectionResult, active: boolean) {
  const [session, setSession] = useState(() => startSession(performance.now()));
  const [now, setNow] = useState(performance.now());
  const acceptAfter = useRef(performance.now());
  const measurements = useRef(new PracticeMeasurements());
  const lastProcessed = useRef(-1);
  const [evaluation, setEvaluation] = useState<Evaluation>(() => tracking("Waiting for camera tracking…"));

  useEffect(() => {
    acceptAfter.current = performance.now();
    measurements.current = new PracticeMeasurements();
    setEvaluation(tracking("Waiting for camera tracking…"));
    setSession(s => s.phase === "complete" ? s : resetStep(s, performance.now()));
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const time = performance.now();
      setNow(time);
      setSession(s => tickSession(s, time, PRACTICE_POSES.length, PRACTICE_POSES[s.poseIndex]?.manual));
    }, 100);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || result.receivedAt <= acceptAfter.current || result.receivedAt <= lastProcessed.current || performance.now() - result.receivedAt > MAX_SAMPLE_GAP_MS) return;
    lastProcessed.current = result.receivedAt;
    const next = measurements.current.evaluate(result, session.poseIndex);
    setEvaluation(next);
    setSession(s => sampleSession(s, result.receivedAt, next.ready,
      practiceFraming(result, s.poseIndex).inFrame));
  }, [active, result, session.poseIndex]);

  const restart = useCallback(() => {
    const time = performance.now();
    acceptAfter.current = time;
    measurements.current = new PracticeMeasurements();
    setEvaluation(tracking("Waiting for camera tracking…"));
    setNow(time);
    setSession(startSession(time));
  }, []);

  const changeStep = useCallback((direction: -1 | 1, manual = false) => {
    const time = performance.now();
    acceptAfter.current = time;
    measurements.current = new PracticeMeasurements();
    setEvaluation(tracking("Waiting for fresh tracking for this step…"));
    setNow(time);
    setSession(s => manual ? confirmManual(s, time, PRACTICE_POSES.length) : navigateSession(s, time, direction, PRACTICE_POSES.length));
  }, []);

  return { session, restart, changeStep, evaluation, now,
    framing: practiceFraming(result, session.poseIndex),
    message: now - result.receivedAt > MAX_SAMPLE_GAP_MS ? "Tracking lost — move fully into view in good light. Hold time paused." : evaluation.message,
    fresh: result.receivedAt > acceptAfter.current && now - result.receivedAt <= MAX_SAMPLE_GAP_MS,
  };
}
