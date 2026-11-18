import type { PoseAngles } from './poseAngles';
import { FEATURES, FINAL_HOLD_MS, TOLERANCE_CAP, correctionFor, jointTolerance, mirrorFeatures, mirrorJoint, phaseError, type Features, type JointError, type Phase, type TemporalPose, type TemporalResult } from './temporalPose';

export interface MovementSection { observed: boolean; matched: boolean; errors: Record<string, { durationMs: number; error: JointError }> }
/**
 * How the movement INTO the final pose went. Holding the final pose ends every attempt; it never by
 * itself makes the movement correct.
 *  - `correct`: every required part of the movement was seen, nothing stayed outside the range of
 *    correct training performers, and the camera did not lose the person while they moved.
 *  - `needs-correction`: persistent deviations were recorded (takes precedence over the others).
 *  - `unable-to-assess`: the camera lost the person for longer than MOVEMENT_GAP_MS while moving.
 *  - `incomplete`: part of the movement was not observed (skipped, too quick for the camera, or
 *    never matched the start of the learned movement).
 */
export type MovementVerdict = 'correct' | 'needs-correction' | 'incomplete' | 'unable-to-assess';
export interface AttemptSummary {
  /** Always true: an attempt completes only after a FINAL_HOLD_MS hold within the final tolerance. */
  finalHeld: boolean;
  verdict: MovementVerdict;
  /** `verdict === 'correct'`. */
  correct: boolean;
  /** Required parts of the movement that were not observed (see `missingDescriptions`). */
  missing: number[]; missingDescriptions: string[];
  needsCorrection: number[]; corrections: string[];
  /** The camera lost the person at some point (setup and hold included). */
  trackingInterrupted: boolean;
  /** ...while they were moving into the pose: the reason for `unable-to-assess`. */
  movementTrackingLost: boolean;
  /**
   * Joints that move during the pose. During the movement they are only checked against the range
   * of correct training performers (and for moving back, where performers agreed), not against their
   * timing with the rest of the body: with 4-6 training performers that check flagged correct people
   * and caught fewer mistakes (ml/RESULTS.md, 2026-11-11). Shown to the user as a limitation.
   */
  rangeOnlyJoints: string[];
  speech: string;
}
export interface ContinuousResult extends TemporalResult { sections: MovementSection[]; summary?: AttemptSummary; mirrored?: boolean; movementEngaged?: boolean }
/**
 * Algorithm switches. All default to on; they exist so `ml/diagnose.cjs` can measure
 * each change's contribution (ablation) on training data.
 */
export interface PracticeOptions {
  /** Keep evidence from at least one learned moving joint after robust trimming. */
  motionRecognition?: boolean;
  /** Score the opposite-side (left/right swapped) performance too, using whichever fits. */
  mirror?: boolean;
  /** While the final pose stays within its own tolerance, keep the final stage selected. */
  holdHysteresis?: boolean;
  /** Out-of-tolerance blips shorter than this neither earn nor reset hold time. */
  holdGraceMs?: number;
  /**
   * Judge in-between movement against the whole learned path (every stage and the interpolated
   * points between consecutive stages), not only the recognized stage. Recognition deliberately
   * ignores the worst-fitting joints, which in some poses are exactly the moving ones.
   */
  pathTolerance?: boolean;
  /**
   * REJECTED (off by default): in-between stages used the learned per-joint tolerance without the
   * 20-degree cap. Many learned in-between tolerances exceed the whole 0-180 degree range, so
   * almost any in-between movement passed. Kept only to reproduce ml/RESULTS.md rows.
   */
  learnedTolerance?: boolean;
  /**
   * Judge each joint by the role learned from correct training performers (`pose.joints`): steady
   * joints must stay inside their band, moving joints inside their range and, where performers
   * agree, without moving back toward the start. Joints without a reliable role ("free") keep the
   * capped learned-path check. Poses trained without roles use the path check for every joint.
   */
  jointRoles?: boolean;
  /**
   * Record each in-between frame in the movement section where it best fits the learned path
   * (requires `pathTolerance`) instead of the recognized stage, so quickly traversed sections
   * are not reported as unseen. Progression and the final hold still use recognition.
   */
  pathCoverage?: boolean;
  /**
   * The movement verdict requires every part of the movement to be seen (COVERAGE_BANDS of the
   * learned moving joints' progress, or every section without learned roles) and no tracking loss
   * while moving. Off: the earlier rule, under which half of the movement could go unseen and
   * tracking loss was only a note (kept to reproduce ml/RESULTS.md rows and the "before" benchmark).
   */
  strictVerdict?: boolean;
}
/** Errors shorter than this are treated as landmark noise, both for summaries and for the hold. */
export const PERSISTENT_ERROR_MS = 250;
/** Keep the spoken review short; the written review lists every correction. */
export const SPOKEN_CORRECTIONS = 3;
/**
 * Parts of the movement that must each be seen, as fractions of the learned moving joints' change
 * from their start to their final angle. The ends are excluded: the start and the final pose are
 * checked separately, and several training recordings begin part-way through the movement.
 */
export const COVERAGE_BANDS: readonly [number, number][] = [[.2, .4], [.4, .6], [.6, .8]];
/** Not seeing the person for longer than this while they move leaves part of the movement unchecked. */
export const MOVEMENT_GAP_MS = 500;
const BAND_PHRASE = ['the early part of the movement', 'the middle of the movement', 'the late part of the movement'];
const jointWords = (joint: string) => joint.replace(/([A-Z])/g, ' $1').toLowerCase();

type Comparison = ReturnType<typeof phaseError>;
const toUserSide = (c: Comparison, mirrored: boolean): Comparison =>
  mirrored ? { ...c, jointErrors: c.jointErrors.map(e => ({ ...e, joint: mirrorJoint(e.joint) })) } : c;
const PATH_STEPS = 10;
/**
 * A point part-way between two learned stages; mean, spread, tolerance and threshold interpolate.
 * `caps` bound each end's tolerance before interpolating (see `jointTolerance`).
 */
export function interpolatePhase(a: Phase, b: Phase, alpha: number, caps: [number, number] = [TOLERANCE_CAP, TOLERANCE_CAP]): Phase {
  const mix = (x: number, y: number) => x + (y - x) * alpha;
  return {
    mean: a.mean.map((v, k) => v === null || b.mean[k] === null ? null : mix(v, b.mean[k]!)),
    scale: a.scale.map((v, k) => mix(v, b.scale[k])),
    threshold: mix(a.threshold, b.threshold),
    tolerance: FEATURES.map((_, k) => mix(jointTolerance(a, k, caps[0]), jointTolerance(b, k, caps[1]))),
  };
}

/** Separate motion recognition from correctness: a bad joint never traps progression. */
export class ContinuousPractice {
  private phase = 0;
  private last = -Infinity;
  private previousObserved = false;
  private previousFinal = false;
  private held = 0;
  private lastFinalMatchAt = -Infinity;
  private inHold = false;
  private mirrored = false;
  private pendingPhase = -1;
  private pendingSince = 0;
  /**
   * Furthest progress of each moving joint toward its final level, indexed by the user's real
   * joint: the left/right orientation can flip between frames in symmetric poses.
   */
  private progress: number[] = FEATURES.map(() => -Infinity);
  /** Joints (user's real side) currently moving back toward the start beyond `maxReturn`. */
  private returning = new Set<number>();
  /**
   * "Moved back" errors wait here: going all the way back to the start is a restart and discards
   * them; otherwise they are committed to the review when the attempt completes.
   */
  private pendingReturns = new Map<string, { joint: number; where: number; durationMs: number; error: JointError }>();
  /** The movement is judged for the review only once every visible joint has matched it. */
  private engaged = false;
  private previousErrors = new Set<string>();
  private interrupted = false;
  /** Last frame in which the person was observed, to measure tracking loss while moving. */
  private lastSeen = -Infinity;
  /** The final pose has been matched at least once: later tracking loss is not "while moving". */
  private reachedFinal = false;
  private movementLost = false;
  /** Which COVERAGE_BANDS of the movement have been observed (with learned moving joints). */
  private covered = COVERAGE_BANDS.map(() => false);
  private sections: MovementSection[];
  private finished?: ContinuousResult;
  private options: Required<PracticeOptions>;
  private pathPoints: {point:Phase;location:number}[] = [];
  constructor(private pose: TemporalPose, options: PracticeOptions = {}) {
    this.options = { mirror: true, holdHysteresis: true, holdGraceMs: PERSISTENT_ERROR_MS, pathTolerance: true, learnedTolerance: false, jointRoles: true, pathCoverage: true,
      strictVerdict: true, motionRecognition: true, ...options };
    for(let a=0;a<pose.phases.length-1;a++)for(let step=0;step<=PATH_STEPS;step++)
      this.pathPoints.push({point:interpolatePhase(pose.phases[a],pose.phases[a+1],step/PATH_STEPS,[this.cap(a),this.cap(a+1)]),location:a+step/PATH_STEPS});
    this.sections = pose.phases.slice(0,-1).map(() => ({observed:false,matched:false,errors:{}}));
  }
  reset() {
    this.phase=0; this.last=-Infinity; this.previousObserved=false; this.previousFinal=false; this.mirrored=false;
    this.held=0; this.lastFinalMatchAt=-Infinity; this.inHold=false; this.pendingPhase=-1; this.previousErrors.clear();
    this.interrupted=false; this.finished=undefined; this.progress.fill(-Infinity); this.returning.clear();
    this.pendingReturns.clear(); this.engaged=false; this.lastSeen=-Infinity; this.reachedFinal=false; this.movementLost=false;
    this.covered=COVERAGE_BANDS.map(()=>false);
    this.sections=this.pose.phases.slice(0,-1).map(()=>({observed:false,matched:false,errors:{}}));
  }
  /** Learned moving joints, when roles are in use; coverage is measured on their progress. */
  private movingJoints() {
    if(!this.options.jointRoles || !this.pose.joints)return [];
    return this.pose.joints.flatMap((r,k)=>r.role==='moving' && Math.abs(r.to-r.from)>=1?[{k,from:r.from,to:r.to}]:[]);
  }
  /** Median progress (0 = start angle, 1 = final angle) of the visible moving joints, canonical side. */
  private movementProgress(values: Features): number | null {
    const progress=this.movingJoints().flatMap(({k,from,to})=>values[k]!==null && Number.isFinite(values[k])?[(values[k]!-from)/(to-from)]:[]).sort((a,b)=>a-b);
    if(!progress.length)return null;
    const mid=progress.length>>1;
    return progress.length%2?progress[mid]:(progress[mid-1]+progress[mid])/2;
  }
  private snapshot() { return this.sections.map(s=>({...s,errors:Object.fromEntries(Object.entries(s.errors).map(([k,v])=>[k,{...v}]))})); }
  private resetHold() { this.held=0; this.previousFinal=false; this.inHold=false; this.lastFinalMatchAt=-Infinity; }
  /** Robust phase recognition uses most joints; all visible joints still contribute to error scoring. */
  private recognitionCosts(comparisons: Comparison[]) {
    return comparisons.map((s,i)=>{
      if(!s.observable)return Infinity;
      const residuals=s.jointErrors.map(e=>e.degrees/this.pose.phases[i].scale[FEATURES.indexOf(e.joint)]).sort((a,b)=>a-b);
      const use=residuals.slice(0,Math.max(3,Math.ceil(residuals.length*.75)));
      // Trimming can discard BOTH shoulders when they are the only moving joints. Retain
      // evidence from the best-fitting mover so one lagging limb cannot freeze recognition.
      const movers=this.movingJoints().flatMap(({k})=>{
        const e=s.jointErrors.find(e=>e.joint===FEATURES[k]);
        return e?[e.degrees/this.pose.phases[i].scale[k]]:[];
      });
      const motion=this.options.motionRecognition && movers.length>0 && movers.length<=residuals.length-use.length?Math.min(...movers)**2:0;
      return use.reduce((sum,v)=>sum+v*v,0)/use.length+motion;
    });
  }
  private matches(stats: Comparison, index: number) {
    return stats.observable && stats.jointErrors.every(e=>!e.outsideTolerance) && stats.normalizedError<=this.pose.phases[index].threshold;
  }
  /** Tolerance cap for a stage: in-between stages may use the learned tolerance, the final pose never. */
  private cap(index: number) {
    return this.options.learnedTolerance && index<this.pose.phases.length-1 ? Infinity : TOLERANCE_CAP;
  }
  /**
   * Correctness of an in-between frame. Starts from the recognized stage, then (with
   * `pathTolerance`) takes the best fit anywhere on the learned path, so never worse than it.
   */
  private judgeMovement(values: Features, index: number): { stats: Comparison; matched: boolean; location: number } {
    const phases=this.pose.phases;
    let best={stats:phaseError(values,phases[index],this.cap(index)),threshold:phases[index].threshold,location:index};
    if(this.options.pathTolerance) for(const {point,location} of this.pathPoints) {
        // Interpolated tolerances are already bounded per end; do not cap them again.
        const stats=phaseError(values,point,Infinity);
        if(stats.observable && stats.normalizedError<best.stats.normalizedError)best={stats,threshold:point.threshold,location};
    }
    const {stats,threshold,location}=best;
    return {stats,location,matched:stats.observable && stats.jointErrors.every(e=>!e.outsideTolerance) && stats.normalizedError<=threshold};
  }
  /**
   * Role-based judgement of an in-between frame (values in the common orientation). "Free" joints
   * keep the learned-path result. A joint's target is the nearest allowed angle, so a correction
   * always points back toward what correct performers do.
   */
  private judgeRoles(values: Features, path: Comparison, mirrored: boolean): Comparison {
    const fromPath=new Map(path.jointErrors.map(e=>[e.joint,e]));
    const jointErrors: Comparison['jointErrors']=[];
    (this.pose.joints ?? []).forEach((r,k)=>{
      const v=values[k], joint=FEATURES[k];
      if(v===null || !Number.isFinite(v) || r.role==='unseen')return;
      if(r.role==='free'){const e=fromPath.get(joint);if(e)jointErrors.push(e);return;}
      const [lo,hi]=r.band;
      let target=Math.min(hi,Math.max(lo,v)), tolerance=Math.max(5,(hi-lo)/2);
      if(r.role==='moving' && r.maxReturn!==null) {
        const u=mirrored?FEATURES.indexOf(mirrorJoint(joint)):k; // the user's real joint
        const direction=Math.sign(r.to-r.from)||1, progress=direction*(v-r.from), quarter=.25*Math.abs(r.to-r.from);
        // Small movements around the start position (settling in) are not judged.
        const started=this.progress[u]>=quarter;
        if(started && progress<quarter) {
          // Back at the start: a restart, not a mistake. Forget the earlier attempt's progress.
          this.progress[u]=progress;this.returning.delete(u);
          for(const [key,p] of this.pendingReturns)if(p.joint===u)this.pendingReturns.delete(key);
        } else this.progress[u]=Math.max(this.progress[u],progress);
        if(started && progress>=quarter && target===v && this.progress[u]-progress>r.maxReturn) {
          target=r.from+direction*(this.progress[u]-r.maxReturn);tolerance=r.maxReturn;this.returning.add(u);
        } else this.returning.delete(u);
      }
      const signed=v-target;
      jointErrors.push({joint,degrees:Math.abs(signed),signedDegrees:signed,actual:v,target,tolerance,
        outsideTolerance:signed!==0,scale:fromPath.get(joint)?.scale??5});
    });
    jointErrors.sort((a,b)=>b.degrees/b.tolerance-a.degrees/a.tolerance);
    return {...path,jointErrors};
  }
  update(angles: PoseAngles, timestamp: number, visible=true): ContinuousResult {
    if(this.finished) return this.finished;
    const base = {phase:this.phase,total:this.pose.phases.length,errorDegrees:null,normalizedError:null,
      jointErrors:[],heldMs:0,sections:this.snapshot()};
    if(!Number.isFinite(timestamp) || timestamp<=this.last) return {...base,status:'tracking',message:'Waiting for the camera…'};
    const gap=timestamp-this.last;
    const dt=this.previousObserved && gap<=500?gap:0;
    if(Number.isFinite(this.last) && gap>500) {this.interrupted=true;this.resetHold();this.previousErrors.clear();this.pendingPhase=-1;this.progress.fill(-Infinity);this.returning.clear();}
    this.last=timestamp;
    const raw=FEATURES.map(k=>angles[k]);
    // Evaluate as performed and, optionally, as the opposite-side variant. Ties keep the
    // current orientation so symmetric postures (e.g. standing) do not flip sides.
    const candidates=(this.options.mirror?[this.mirrored,!this.mirrored]:[false]).map(mirrored=>{
      const values=mirrored?mirrorFeatures(raw):raw;
      const comparisons=this.pose.phases.map(p=>phaseError(values,p));
      const costs=this.recognitionCosts(comparisons);
      return {mirrored,comparisons,costs,minimum:Math.min(...costs)};
    });
    const chosen=candidates.reduce((best,c)=>c.minimum<best.minimum?c:best);
    const {comparisons,costs,minimum}=chosen;
    // A poor reference match is a posture error, not evidence that the camera lost
    // the person. Observability already requires a complete measured limb chain.
    if(!visible || !Number.isFinite(minimum)) {
      this.interrupted=true;this.resetHold();this.previousObserved=false;this.previousErrors.clear();this.pendingPhase=-1;this.progress.fill(-Infinity);this.returning.clear();
      return {...base,status:'tracking',message:'Keep your whole body in view.'};
    }
    this.mirrored=chosen.mirrored;
    this.previousObserved=true;
    // Unseen for too long while moving (after the movement began, before the final pose was
    // reached): that part of the movement cannot be judged either way.
    if(this.engaged && !this.reachedFinal && timestamp-this.lastSeen>MOVEMENT_GAP_MS)this.movementLost=true;
    this.lastSeen=timestamp;
    const last=this.pose.phases.length-1;
    // Stay near the previous estimate on ties; errors do not determine progression.
    let candidate=costs.reduce((best,c,i)=>c+Math.abs(i-this.phase)*.02 < costs[best]+Math.abs(best-this.phase)*.02?i:best,0);
    // The last intermediate stage is, by construction, almost the final pose. Without this,
    // nearest-stage recognition alternates between them and every switch reset the hold even
    // though the person stayed within the final pose's own tolerance.
    if(this.options.holdHysteresis && (candidate>=last-1 || this.inHold) && this.matches(comparisons[last],last))candidate=last;
    if(candidate>this.phase+1) {
      if(this.pendingPhase!==candidate) {this.pendingPhase=candidate;this.pendingSince=timestamp;}
      if(timestamp-this.pendingSince<100) {
        this.previousErrors.clear();this.resetHold();
        return {...base,status:'tracking',message:'Following your movement…'};
      }
    } else this.pendingPhase=-1;
    // Backward motion is observable but does not erase already recorded coverage.
    this.phase=candidate;
    const final=candidate===last;
    const canonical=chosen.mirrored?mirrorFeatures(raw):raw;
    // The final pose keeps its own calibrated hold check, unchanged.
    const holding=final && this.matches(comparisons[last],last);
    const roles=this.options.jointRoles && !!this.pose.joints;
    // Until the final pose is actually held, the person is still moving. Recognition ignores the
    // worst-fitting joints, so a joint moving back can still be "recognized" as the final stage;
    // with learned roles those frames are judged as movement too.
    const moving=!final || (roles && !holding);
    let path=moving ? this.judgeMovement(canonical,final?last-1:candidate) : null;
    if(path && roles) {
      const roleStats=this.judgeRoles(canonical,path.stats,chosen.mirrored);
      path={...path,stats:roleStats,matched:roleStats.observable && roleStats.jointErrors.every(e=>!e.outsideTolerance)};
    }
    // With learned roles, getting into position (e.g. kneeling, then lying down on the mat) is not
    // part of the movement: nothing is recorded for the review until every visible joint satisfies
    // its role at once. Joint angles alone cannot tell kneeling upright from a lifted cobra, so a
    // partial match is not enough. Live guidance is shown either way. (Without roles: unchanged.)
    this.engaged ||= !roles || holding || !!path?.matched;
    this.reachedFinal ||= holding;
    // Shown to the person: the final check on final-stage frames, the movement check otherwise.
    const stats=toUserSide(final ? comparisons[last] : path!.stats,chosen.mirrored);
    const errors=stats.jointErrors.filter(e=>e.outsideTolerance);
    const matched=final ? holding : path!.matched;
    const keys=new Set<string>();
    if(path && this.engaged) {
      const recorded=toUserSide(path.stats,chosen.mirrored).jointErrors.filter(e=>e.outsideTolerance);
      const where=this.options.pathTolerance && this.options.pathCoverage ? Math.min(last-1,Math.round(path.location)) : Math.min(last-1,candidate);
      const section=this.sections[where];section.observed=true;section.matched ||= path.matched;
      // Coverage of the movement INTO the final pose: back at the start position, it begins again
      // (otherwise lowering the arms earlier, then jumping into the pose, would count as coverage).
      const progress=this.movementProgress(canonical);
      if(progress!==null && progress<COVERAGE_BANDS[0][0])this.covered.fill(false);
      else if(progress!==null)COVERAGE_BANDS.forEach(([lo,hi],i)=>{if(progress>=lo && progress<hi)this.covered[i]=true;});
      for(const error of recorded) {
        const direction=error.signedDegrees>0?'high':'low';
        const continuityKey=`${error.joint}:${direction}`;
        const key=`${where}:${continuityKey}`;keys.add(continuityKey);
        const k=FEATURES.indexOf(error.joint); // already the user's real side
        if(this.returning.has(k)) {
          const pending=this.pendingReturns.get(key)??{joint:k,where,durationMs:0,error};
          if(this.previousErrors.has(continuityKey))pending.durationMs+=dt;
          if(error.degrees>pending.error.degrees)pending.error=error;
          this.pendingReturns.set(key,pending);
          continue;
        }
        const entry=section.errors[key]??{durationMs:0,error};
        if(this.previousErrors.has(continuityKey))entry.durationMs+=dt;
        if(error.degrees>entry.error.degrees)entry.error=error;
        section.errors[key]=entry;
      }
    }
    this.previousErrors=keys;
    let graced=false;
    if(final && matched) {
      // Credit only intervals bounded by two consecutive in-range observations.
      if(this.previousFinal)this.held+=dt;
      this.previousFinal=true;this.inHold=true;this.lastFinalMatchAt=timestamp;
    } else if(this.inHold && timestamp-this.lastFinalMatchAt<=this.options.holdGraceMs) {
      graced=true;this.previousFinal=false; // a brief blip: no credit, no reset
    } else this.resetHold();
    const status: TemporalResult['status']=matched||graced?'matching':'adjust';
    const current: ContinuousResult={...base,...stats,phase:candidate,sections:this.snapshot(),heldMs:Math.min(this.held,FINAL_HOLD_MS),
      mirrored:chosen.mirrored,movementEngaged:this.engaged,status,
      message:status==='matching'?(final?'Hold steady and breathe.':'Good — keep going.')
        : `${correctionFor(errors[0]??stats.jointErrors[0])}${final?', then hold.':'.'}`};
    if(this.held>=FINAL_HOLD_MS) {
      // Moving back part-way and then continuing is a real deviation: commit it to the review.
      for(const [key,{where,durationMs,error}] of this.pendingReturns) {
        const entry=this.sections[where].errors[key]??{durationMs:0,error};
        entry.durationMs+=durationMs;if(error.degrees>entry.error.degrees)entry.error=error;
        this.sections[where].errors[key]=entry;
      }
      this.pendingReturns.clear();
      const movers=this.movingJoints();
      const rangeOnly=movers.map(({k})=>jointWords(chosen.mirrored?mirrorJoint(FEATURES[k]):FEATURES[k]));
      const summary=summarizeAttempt(this.sections,{trackingInterrupted:this.interrupted,movementTrackingLost:this.movementLost,
        coverage:movers.length?this.covered:undefined,rangeOnlyJoints:rangeOnly,strict:this.options.strictVerdict},this.pose);
      // Only the hold is reported here: the movement verdict is a separate statement.
      this.finished={...current,status:'complete',summary,message:'Final pose held.'};
      return this.finished;
    }
    return current;
  }
}

const location=(i:number,count:number)=>i/Math.max(1,count-1)<.34?'early':i/Math.max(1,count-1)<.67?'middle':'late';
const LOCATION_PHRASE: Record<string,string>={early:'Early in the movement',middle:'Midway through the movement',late:'Near the end of the movement'};

export interface AttemptState {
  trackingInterrupted: boolean; movementTrackingLost?: boolean;
  /** Observed COVERAGE_BANDS; without learned moving joints every section must be observed instead. */
  coverage?: boolean[]; rangeOnlyJoints?: string[];
  /** See PracticeOptions.strictVerdict (default true). */
  strict?: boolean;
}
export function summarizeAttempt(sections: MovementSection[], state: AttemptState, pose?: TemporalPose): AttemptSummary {
  const {trackingInterrupted, movementTrackingLost=false, coverage, rangeOnlyJoints=[], strict=true}=state;
  const unseenSections=sections.flatMap((s,i)=>s.observed?[]:[i]);
  const bands=strict && coverage !== undefined;
  const missing=bands ? coverage!.flatMap((seen,i)=>seen?[]:[i]) : unseenSections;
  const needsCorrection=sections.flatMap((s,i)=>s.observed && (!s.matched || Object.values(s.errors).some(e=>e.durationMs>=PERSISTENT_ERROR_MS))?[i]:[]);
  const grouped=new Map<string,{error:JointError;locations:Set<string>;durationMs:number}>();
  sections.forEach((s,i)=>Object.values(s.errors).filter(e=>e.durationMs>0).forEach(({error,durationMs})=>{
    const key=error.joint+(error.signedDegrees>0?'high':'low');
    const item=grouped.get(key)??{error,locations:new Set<string>(),durationMs:0};
    item.locations.add(location(i,sections.length));
    item.durationMs+=durationMs;
    grouped.set(key,item);
  }));
  // Most persistent first: the spoken review keeps only the top few (see SPOKEN_CORRECTIONS).
  const corrections=[...grouped.values()].filter(e=>e.durationMs>=PERSISTENT_ERROR_MS).sort((a,b)=>b.durationMs-a.durationMs).map(({error,locations})=>{
    const when=locations.size===1?LOCATION_PHRASE[[...locations][0]]:'At several points in the movement';
    return `${when}, ${correctionFor(error).toLowerCase()}.`;
  });
  const deviations=needsCorrection.length>0 || corrections.length>0;
  // Earlier rule (strict off): up to half of the movement could go unseen, and tracking loss while
  // moving did not matter. That accepted skipped movement as correct (ml/RESULTS.md, 2026-11-11).
  const verdict: MovementVerdict=deviations ? 'needs-correction'
    : !strict ? (missing.length<=sections.length/2 ? 'correct' : 'incomplete')
    : movementTrackingLost ? 'unable-to-assess' : missing.length ? 'incomplete' : 'correct';
  // Kept for reports/diagnostics only; the spoken and written guidance avoids stage labels.
  const missingDescriptions=missing.map(i=>{
    if(bands)return BAND_PHRASE[i];
    if(i===0)return 'the starting position';
    const where=location(i,sections.length);
    if(!pose)return `the ${where} movement`;
    const changes=FEATURES.map((joint,k)=>({joint,change:pose.phases[i].mean[k]!==null && pose.phases[i-1].mean[k]!==null
      ? Math.abs(pose.phases[i].mean[k]!-pose.phases[i-1].mean[k]!) : 0})).sort((a,b)=>b.change-a.change);
    const joint=changes[0];
    return joint.change<5?`the ${where} body alignment`:`the ${where} ${jointWords(joint.joint)} movement`;
  });
  // "Final pose held" and "movement correct" are separate statements; only the verdict says the latter.
  const speech=[MOVEMENT_SPEECH[verdict],
    ...corrections.slice(0,SPOKEN_CORRECTIONS),
    needsCorrection.length && !corrections.length?'Parts of the movement were outside the range of correct performers.':'',
    verdict==='needs-correction' && missing.length?'Part of the movement was not seen.':'',
    verdict==='incomplete' || verdict==='needs-correction'?'Next time, move slowly through the whole movement with the demonstration.':'',
    verdict==='unable-to-assess'?'Keep your whole body in view while you move.':''].filter(Boolean).join(' ');
  return {finalHeld:true,verdict,correct:verdict==='correct',missing,missingDescriptions,needsCorrection,corrections,
    trackingInterrupted,movementTrackingLost,rangeOnlyJoints,speech};
}
export const MOVEMENT_SPEECH: Record<MovementVerdict,string>={
  correct:'You held the final pose, and your movement into it stayed within the range of correct performers.',
  'needs-correction':'You held the final pose, but your movement into it needs correction.',
  incomplete:'You held the final pose, but not enough of the movement into it was seen to check it.',
  'unable-to-assess':'You held the final pose, but the camera lost sight of you during the movement, so it could not be checked.',
};
