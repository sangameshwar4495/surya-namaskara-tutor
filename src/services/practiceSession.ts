export const HOLD_MS = 5000;
export const PREPARE_MS = 3000;
export const MAX_SAMPLE_GAP_MS = 500;
export const FRAMING_STABLE_MS = 1000;
export const INTERRUPTION_GRACE_MS = 800;
export interface Session {
  poseIndex: number;
  cameraChecked: boolean;
  phase: "setup" | "prepare" | "holding" | "manual" | "success" | "complete";
  until: number;
  heldMs: number;
  lastSample: number | null;
  framedSince: number | null;
  interruptedSince: number | null;
  outcomes: Record<number, "verified" | "manual" | "skipped">;
}
export const startSession = (now: number): Session => ({ poseIndex: 0, cameraChecked: false, phase: "setup", until: now, heldMs: 0, lastSample: null, framedSince: null, interruptedSince: null, outcomes: {} });

export const resetStep = (s: Session, now: number): Session => ({ ...startSession(now), poseIndex: s.poseIndex, cameraChecked: s.cameraChecked, outcomes: s.outcomes });

export function navigateSession(s: Session, now: number, direction: -1 | 1, count: number): Session {
  if (direction === -1 && s.poseIndex === 0) return s;
  const outcomes = direction === 1 ? { ...s.outcomes, [s.poseIndex]: s.outcomes[s.poseIndex] ?? "skipped" as const } : s.outcomes;
  const index = s.poseIndex + direction;
  if (index >= count) return { ...s, phase: "complete", outcomes, lastSample: null };
  return { ...startSession(now), poseIndex: index, cameraChecked: s.cameraChecked, outcomes };
}

export function confirmManual(s: Session, now: number, count: number): Session {
  if (s.phase !== "manual") return s;
  return navigateSession({ ...s, outcomes: { ...s.outcomes, [s.poseIndex]: "manual" } }, now, 1, count);
}

/** Only consecutive, fresh, successful detection samples earn hold time. */
export function tickSession(s: Session, now: number, count: number, manual = false): Session {
  if (s.phase === "setup" || s.phase === "prepare") {
    if (s.lastSample === null || now - s.lastSample > MAX_SAMPLE_GAP_MS) {
      return resetStep(s, now);
    }
    if (s.phase === "prepare" && now >= s.until) return { ...s, cameraChecked: true, phase: manual ? "manual" : "holding", lastSample: null };
  }
  if (s.phase === "success" && now >= s.until) return s.poseIndex + 1 >= count
    ? { ...s, phase: "complete", lastSample: null }
    : { ...startSession(now), poseIndex: s.poseIndex + 1, cameraChecked: s.cameraChecked, outcomes: s.outcomes };
  if (s.phase === "holding") {
    const interruptedSince = s.interruptedSince ?? (s.lastSample !== null && now - s.lastSample > MAX_SAMPLE_GAP_MS ? s.lastSample : null);
    if (interruptedSince !== null) return { ...s, interruptedSince, lastSample: null,
      heldMs: now - interruptedSince >= INTERRUPTION_GRACE_MS ? 0 : s.heldMs };
  }
  return s;
}
export function sampleSession(s: Session, now: number, ready: boolean, inFrame = false): Session {
  if (s.phase === "setup" || s.phase === "prepare") {
    if (!inFrame) return resetStep(s, now);
    const continuous = s.lastSample !== null && now >= s.lastSample && now - s.lastSample <= MAX_SAMPLE_GAP_MS;
    const framedSince = continuous ? s.framedSince ?? now : now;
    if (!continuous) return { ...resetStep(s, now), framedSince, lastSample: now };
    return { ...s, framedSince, lastSample: now,
      phase: s.phase === "prepare" || now - framedSince >= FRAMING_STABLE_MS ? "prepare" : "setup",
      until: s.phase === "setup" ? now + PREPARE_MS : s.until };
  }
  if (s.phase !== "holding") return s;
  const gap = s.lastSample !== null && now - s.lastSample > MAX_SAMPLE_GAP_MS;
  const interruptedSince = s.interruptedSince ?? (gap ? s.lastSample : null);
  const expired = interruptedSince !== null && now - interruptedSince >= INTERRUPTION_GRACE_MS;
  if (!ready) return { ...s, heldMs: expired ? 0 : s.heldMs, lastSample: null,
    interruptedSince: interruptedSince ?? now };
  const delta = s.lastSample === null ? 0 : now - s.lastSample;
  if (delta < 0) return { ...s, heldMs: 0, lastSample: null };
  const heldMs = Math.min(HOLD_MS, (expired ? 0 : s.heldMs) + (interruptedSince !== null || gap ? 0 : delta));
  return { ...s, heldMs, lastSample: now, interruptedSince: null,
    outcomes: heldMs >= HOLD_MS ? { ...s.outcomes, [s.poseIndex]: "verified" } : s.outcomes,
    phase: heldMs >= HOLD_MS ? "success" : "holding",
    until: heldMs >= HOLD_MS ? now + 1500 : s.until };
}
