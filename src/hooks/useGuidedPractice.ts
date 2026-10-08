import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PoseDetectionResult } from "../types/pose";
import { evaluatePose, PRACTICE_POSES } from "../services/practiceEvaluator";
import { MAX_SAMPLE_GAP_MS, PREPARE_MS, sampleSession, startSession, tickSession } from "../services/practiceSession";

export function useGuidedPractice(result: PoseDetectionResult, active: boolean) {
  const [session, setSession] = useState(() => startSession(performance.now()));
  const [now, setNow] = useState(performance.now());
  const acceptAfter = useRef(performance.now());
  const evaluation = useMemo(() => evaluatePose(result, session.poseIndex), [result, session.poseIndex]);
  const [message, setMessage] = useState(evaluation.message);

  useEffect(() => {
    acceptAfter.current = performance.now();
    setSession(s => s.phase === "complete" ? s : {
      ...s, phase: "prepare", until: performance.now() + PREPARE_MS, heldMs: 0, lastSample: null,
    });
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const time = performance.now();
      setNow(time);
      setSession(s => tickSession(s, time, PRACTICE_POSES.length));
    }, 100);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || result.receivedAt <= acceptAfter.current || performance.now() - result.receivedAt > MAX_SAMPLE_GAP_MS) return;
    setSession(s => sampleSession(s, result.receivedAt, evaluation.ready));
  }, [active, result, evaluation]);

  // Stabilize spoken/readable corrections without letting bad frames earn hold time.
  useEffect(() => {
    const timer = setTimeout(() => setMessage(evaluation.message), 250);
    return () => clearTimeout(timer);
  }, [evaluation.message]);

  const restart = useCallback(() => {
    const time = performance.now();
    acceptAfter.current = time;
    setNow(time);
    setSession(startSession(time));
  }, []);

  return { session, restart, evaluation, now,
    message: now - result.receivedAt > MAX_SAMPLE_GAP_MS ? "Waiting for fresh camera tracking…" : message,
    fresh: now - result.receivedAt <= MAX_SAMPLE_GAP_MS,
  };
}
