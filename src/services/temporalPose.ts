import type { PoseAngles } from './poseAngles';

export const FEATURES = ['leftKnee', 'rightKnee', 'leftElbow', 'rightElbow', 'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const;
export const JOINT_LANDMARKS = [25, 26, 13, 14, 11, 12, 23, 24];
export const FINAL_HOLD_MS = 1500;
export type Features = (number | null)[];
/**
 * `threshold` bounds the RMS normalized error. `jointThreshold` (when present) is the
 * separately calibrated multiplier for each individual joint: the largest single-joint
 * deviation is naturally larger than an RMS average, so reusing the RMS threshold for
 * the per-joint check made it systematically stricter than its calibration.
 * `tolerance` (final stage) is a held-out per-joint allowance in degrees.
 */
export interface Phase { mean: Features; scale: number[]; threshold: number; jointThreshold?: number; tolerance?: number[] }
export interface TemporalPose { name: string; phases: Phase[]; trainingVideos: number }
export interface TemporalModel {
  version: number; reviewed: boolean; features: string[]; poses: TemporalPose[]; sequence: string[];
  referenceKey?: string;
  validation?: { evaluated: number; completed: number; verified?: number; unscorable: number; productionReady: boolean };
}
export interface TemporalResult {
  status: 'tracking' | 'adjust' | 'matching' | 'complete';
  phase: number; total: number; errorDegrees: number | null; normalizedError: number | null;
  jointErrors: JointError[]; message: string; heldMs: number;
}
export interface JointError {
  joint: typeof FEATURES[number]; degrees: number; signedDegrees: number;
  actual: number; target: number; tolerance: number; outsideTolerance: boolean;
}
/** Learned spread, with a cap so a highly variable reference cannot excuse a large error. */
export function jointTolerance(phase: Phase, index: number): number {
  const learned = phase.tolerance?.[index] ?? phase.scale[index] * (phase.jointThreshold ?? phase.threshold);
  return Math.max(5, Math.min(20, learned));
}
/** Left/right feature pairs: [leftKnee,rightKnee], [leftElbow,rightElbow], ... */
const MIRROR_INDEX = [1, 0, 3, 2, 5, 4, 7, 6];
/**
 * The same asana may be performed on either side (lifted leg, bend direction, camera on
 * the other side of the mat). Swapping each left/right pair expresses a performance in
 * the opposite-side orientation without inventing any angle.
 */
export function mirrorFeatures(values: Features): Features {
  return MIRROR_INDEX.map(i => values[i] ?? null);
}
export function mirrorJoint(joint: typeof FEATURES[number]): typeof FEATURES[number] {
  return FEATURES[MIRROR_INDEX[FEATURES.indexOf(joint)]];
}
export function correctionFor(error: JointError): string {
  const side = error.joint.startsWith('left') ? 'left' : 'right';
  const more = error.signedDegrees > 0;
  if (error.joint.endsWith('Knee')) return more ? `Bend your ${side} knee slightly` : `Gently straighten your ${side} knee without locking it`;
  if (error.joint.endsWith('Elbow')) return more ? `Bend your ${side} elbow slightly` : `Gently straighten your ${side} elbow`;
  if (error.joint.endsWith('Shoulder')) return more ? `Bring your ${side} upper arm closer to your torso` : `Move your ${side} upper arm farther from your torso`;
  return more ? `Increase the bend at your ${side} hip slightly` : `Open your ${side} hip angle slightly`;
}
export function validateModel(value: TemporalModel): void {
  if (value.version !== 1 || value.features.join() !== FEATURES.join() || typeof value.reviewed !== 'boolean' ||
      !Array.isArray(value.poses) || !Array.isArray(value.sequence)) throw new Error('Unsupported temporal model');
  if (new Set(value.poses.map(p => p.name)).size !== value.poses.length) throw new Error('Duplicate pose');
  for (const pose of value.poses) {
    if (!value.sequence.includes(pose.name) || pose.phases.length < 3) throw new Error('Invalid pose phases');
    for (const phase of pose.phases) {
      if (phase.mean.length !== FEATURES.length || phase.scale.length !== FEATURES.length ||
          !phase.mean.every(v => v === null || (Number.isFinite(v) && v >= 0 && v <= 180)) || !hasSide(phase.mean) ||
          !phase.scale.every(v => Number.isFinite(v) && v > 0) ||
          !Number.isFinite(phase.threshold) || phase.threshold <= 0 ||
          (phase.jointThreshold !== undefined && (!Number.isFinite(phase.jointThreshold) || phase.jointThreshold <= 0)) ||
          (phase.tolerance !== undefined && (phase.tolerance.length !== FEATURES.length || !phase.tolerance.every(v => Number.isFinite(v) && v > 0)))) throw new Error('Invalid phase statistics');
    }
  }
}
export function hasSide(values: Features): boolean {
  return [[0,2,4,6],[1,3,5,7]].some(indices => indices.every(i => typeof values[i] === 'number' && Number.isFinite(values[i]) && values[i]! >= 0 && values[i]! <= 180));
}
export function phaseError(values: Features, phase: Phase) {
  const jointErrors = values.flatMap((v, i) => v !== null && phase.mean[i] !== null && Number.isFinite(v)
    ? [{ joint: FEATURES[i], degrees: Math.abs(v - phase.mean[i]!), scale: phase.scale[i],
      signedDegrees: v - phase.mean[i]!, actual: v, target: phase.mean[i]!, tolerance: jointTolerance(phase,i),
      outsideTolerance: Math.abs(v - phase.mean[i]!) > jointTolerance(phase,i) }] : []);
  const observable = hasSide(values.map((v,i)=>phase.mean[i] === null ? null : v));
  return {
    observable,
    errorDegrees: observable ? Math.sqrt(jointErrors.reduce((s, e) => s + e.degrees ** 2, 0) / jointErrors.length) : Infinity,
    normalizedError: observable ? Math.sqrt(jointErrors.reduce((s, e) => s + (e.degrees / e.scale) ** 2, 0) / jointErrors.length) : Infinity,
    jointErrors: jointErrors.sort((a, b) => b.degrees / b.tolerance - a.degrees / a.tolerance),
  };
}
/** Ordered, speed-independent checkpoint matching. No jumping to the final hold. */
export class TemporalTracker {
  private phase = 0;
  private last = -Infinity;
  private lastObserved = -Infinity;
  private matchingMs = 0;
  private completed = false;
  private lastMatched = false;
  constructor(private pose: TemporalPose, private reviewed: boolean) {}
  reset() { this.phase = 0; this.last = -Infinity; this.lastObserved = -Infinity; this.matchingMs = 0; this.completed = false; this.lastMatched = false; }
  update(angles: PoseAngles, timestamp: number, visible = true): TemporalResult {
    const base = { phase: this.phase, total: this.pose.phases.length, errorDegrees: null, normalizedError: null, jointErrors: [], heldMs: 0 };
    const values = FEATURES.map(k => angles[k]);
    if (!Number.isFinite(timestamp) || timestamp <= this.last) return { ...base, status: 'tracking', message: 'Waiting for a fresh frame' };
    const gap = timestamp - this.last;
    this.last = timestamp;
    if (gap > 500) { this.matchingMs = 0; this.completed = false; this.lastMatched = false; }
    if (gap > 1000 || timestamp - this.lastObserved > 1000) this.phase = 0;
    base.phase = this.phase;
    const stats = phaseError(values, this.pose.phases[this.phase]);
    if (!visible || !stats.observable) {
      this.matchingMs = 0;
      this.completed = false;
      this.lastMatched = false;
      return { ...base, status: 'tracking', message: 'Show a complete camera-facing arm and leg; movement scoring paused' };
    }
    this.lastObserved = timestamp;
    if (stats.normalizedError > this.pose.phases[this.phase].threshold || stats.jointErrors.some(e => e.outsideTolerance)) {
      this.matchingMs = 0;
      this.completed = false;
      this.lastMatched = false;
      const error = stats.jointErrors[0];
      return { ...base, ...stats, status: 'adjust', message: `${correctionFor(error)}. Follow the target comfortably.` };
    }
    this.matchingMs += this.lastMatched && gap <= 500 ? gap : 0;
    this.lastMatched = true;
    const final = this.phase === this.pose.phases.length - 1;
    // Intermediate positions are traversed, not held. Requiring a dwell here
    // incorrectly rejects fast but valid transitions sampled at 8 fps.
    if (!final || this.matchingMs >= FINAL_HOLD_MS) {
      if (final) this.completed = true;
      else { this.phase++; this.matchingMs = 0; this.lastMatched = false; }
    }
    return { ...base, ...stats, heldMs: final ? Math.min(FINAL_HOLD_MS, this.matchingMs) : 0, status: this.completed ? 'complete' : 'matching',
      message: this.completed ? (this.reviewed ? 'Entry movement and final hold match the reference' : 'Draft reference matched — correctness is not validated')
        : final ? 'Final pose is within tolerance — hold comfortably and breathe'
          : 'Within the learned tolerance — continue slowly toward the next target' };
  }
}
