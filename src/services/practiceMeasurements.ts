import type { PoseDetectionResult } from "../types/pose";
import type { PoseAngles } from "./poseAngles";
import { evaluatePose, tracking, type Evaluation } from "./practiceEvaluator";
import { INTERRUPTION_GRACE_MS, MAX_SAMPLE_GAP_MS } from "./practiceSession";
import { visibleSide } from "./sideTracking";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** One instance per practice run; never smooth over missing tracking or pose changes. */
export class PracticeMeasurements {
  private frames: PoseDetectionResult[] = [];
  private poseIndex = -1;
  private lastAccepted: number | null = null;
  private mismatchSince: number | null = null;
  private side: string | undefined;

  evaluate(result: PoseDetectionResult, poseIndex: number): Evaluation {
    const previous = this.frames.at(-1);
    const side = poseIndex === 1 ? visibleSide(result.landmarks)?.name : undefined;
    if (side !== this.side || poseIndex !== this.poseIndex || (previous &&
      (result.receivedAt <= previous.receivedAt || result.receivedAt - previous.receivedAt > MAX_SAMPLE_GAP_MS))) {
      this.frames = [];
      this.lastAccepted = null;
      this.mismatchSince = null;
    }
    this.poseIndex = poseIndex;
    this.side = side;
    const accepted = this.lastAccepted !== null && result.receivedAt - this.lastAccepted < INTERRUPTION_GRACE_MS;
    const raw = evaluatePose(result, poseIndex, accepted);
    // Current confidence and framing always override historical good measurements.
    if (raw.kind === "tracking") {
      this.frames = [];
      this.mismatchSince = null;
      return raw;
    }
    this.frames = [...this.frames.filter(frame => result.receivedAt - frame.receivedAt <= 300), result].slice(-5);
    if (this.frames.length < 3) return tracking("Hold still while tracking settles");
    const angles = { ...result.angles };
    for (const key of Object.keys(angles) as (keyof PoseAngles)[]) {
      const values = this.frames.map(frame => frame.angles[key]).filter((v): v is number => v !== null && Number.isFinite(v));
      angles[key] = result.angles[key] === null || !values.length ? null : median(values);
    }
    const landmarks = result.landmarks.map((point, index) => ({ ...point,
      x: median(this.frames.map(frame => frame.landmarks[index].x)),
      y: median(this.frames.map(frame => frame.landmarks[index].y)),
      z: median(this.frames.map(frame => frame.landmarks[index].z)),
    }));
    const smoothed = evaluatePose({ ...result, angles, landmarks }, poseIndex, accepted);
    if (smoothed.ready && raw.ready) {
      this.lastAccepted = result.receivedAt;
      this.mismatchSince = null;
      return smoothed;
    }
    this.mismatchSince ??= result.receivedAt;
    // A raw outlier pauses credit but does not immediately announce a correction.
    if (smoothed.ready || raw.ready || result.receivedAt - this.mismatchSince < INTERRUPTION_GRACE_MS) {
      return { ready: false, kind: "adjusting", message: "Hold time paused — settle gently into the pose" };
    }
    return smoothed;
  }
}
