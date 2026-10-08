export const HOLD_MS = 5000;
export const PREPARE_MS = 3000;
export const MAX_SAMPLE_GAP_MS = 500;
export interface Session {
  poseIndex: number;
  phase: "prepare" | "holding" | "success" | "complete";
  until: number;
  heldMs: number;
  lastSample: number | null;
}
export const startSession = (now: number): Session => ({ poseIndex: 0, phase: "prepare", until: now + PREPARE_MS, heldMs: 0, lastSample: null });

/** Only consecutive, fresh, successful detection samples earn hold time. */
export function tickSession(s: Session, now: number, count: number): Session {
  if (s.phase === "prepare" && now >= s.until) return { ...s, phase: "holding", lastSample: null };
  if (s.phase === "success" && now >= s.until) return s.poseIndex + 1 >= count
    ? { ...s, phase: "complete", lastSample: null }
    : { ...startSession(now), poseIndex: s.poseIndex + 1 };
  if (s.phase === "holding" && s.lastSample !== null && now - s.lastSample > MAX_SAMPLE_GAP_MS) {
    return { ...s, heldMs: 0, lastSample: null };
  }
  return s;
}
export function sampleSession(s: Session, now: number, ready: boolean): Session {
  if (s.phase !== "holding") return s;
  if (!ready) return { ...s, heldMs: 0, lastSample: null };
  const delta = s.lastSample === null ? 0 : now - s.lastSample;
  if (delta < 0) return { ...s, heldMs: 0, lastSample: null };
  const heldMs = Math.min(HOLD_MS, delta > MAX_SAMPLE_GAP_MS ? 0 : s.heldMs + delta);
  return { ...s, heldMs, lastSample: now,
    phase: heldMs >= HOLD_MS ? "success" : "holding",
    until: heldMs >= HOLD_MS ? now + 1500 : s.until };
}
