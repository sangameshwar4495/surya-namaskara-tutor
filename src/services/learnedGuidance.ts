import type { Landmark } from '../types/pose';
import type { TemporalModel, TemporalResult } from './temporalPose';
import { FEATURES, JOINT_LANDMARKS } from './temporalPose';

export interface ReferenceLibrary {
  version: number; modelKey: string; sourceAspect: number;
  poses: { name: string; phases: { landmarks: Landmark[] }[] }[];
}
export function referenceFor(library: ReferenceLibrary, model: TemporalModel, name: string, phase: number, cameraAspect = library.sourceAspect): Landmark[] {
  if (library.version !== 1 || !model.referenceKey || library.modelKey !== model.referenceKey) return [];
  const reference = library.poses.find(p => p.name === name);
  const pose = model.poses.find(p => p.name === name);
  if (!reference || reference.phases.length !== pose?.phases.length) return [];
  if (!Number.isFinite(cameraAspect) || cameraAspect <= 0) return [];
  const fit = Math.min(1,cameraAspect/library.sourceAspect);
  // Fit without stretching, then mirror for the front-camera preview.
  return (reference.phases[phase]?.landmarks ?? []).map(p => ({ ...p,
    x: .5 + (.5-p.x)*library.sourceAspect/cameraAspect*fit,
    y: .5 + (p.y-.5)*fit,
  }));
}
export function highlightedJoints(feedback: TemporalResult | null): number[] {
  if (!feedback || feedback.status !== 'adjust') return [];
  return feedback.jointErrors.filter(e => e.outsideTolerance).map(e => JOINT_LANDMARKS[FEATURES.indexOf(e.joint)]);
}
/** One short setup line per pose, shown under the pose name and spoken at the start. */
export const MOVEMENT_SETUP: Record<string, string> = {
  Tadasana: 'Stand tall facing the camera, arms by your sides.',
  Vrikshasana: 'Stand facing the camera. Balance on either leg.',
  Trikasana: 'Face the camera with your feet wide apart. Bend to either side.',
  Bhujasana: 'Place the camera beside your mat and lie face down, hands near your chest.',
  Padamasana: 'Sit facing the camera with your hips, knees and ankles in view.',
};
