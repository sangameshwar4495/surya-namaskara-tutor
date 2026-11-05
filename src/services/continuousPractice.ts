import type { PoseAngles } from './poseAngles';
import { FEATURES, FINAL_HOLD_MS, correctionFor, mirrorFeatures, mirrorJoint, phaseError, type JointError, type TemporalPose, type TemporalResult } from './temporalPose';

export interface MovementSection { observed: boolean; matched: boolean; errors: Record<string, { durationMs: number; error: JointError }> }
export interface AttemptSummary {
  finalHeld: boolean; verified: boolean; missing: number[]; needsCorrection: number[];
  missingDescriptions: string[]; corrections: string[]; trackingInterrupted: boolean; speech: string;
}
export interface ContinuousResult extends TemporalResult { sections: MovementSection[]; summary?: AttemptSummary; mirrored?: boolean }
/**
 * Algorithm switches. All default to on; they exist so `ml/diagnose.cjs` can measure
 * each change's contribution (ablation) on training data.
 */
export interface PracticeOptions {
  /** Score the opposite-side (left/right swapped) performance too, using whichever fits. */
  mirror?: boolean;
  /** While the final pose stays within its own tolerance, keep the final stage selected. */
  holdHysteresis?: boolean;
  /** Out-of-tolerance blips shorter than this neither earn nor reset hold time. */
  holdGraceMs?: number;
}
/** Errors shorter than this are treated as landmark noise, both for summaries and for the hold. */
export const PERSISTENT_ERROR_MS = 250;
/** Keep the spoken review short; the written review lists every correction. */
export const SPOKEN_CORRECTIONS = 3;
const TRACKING_COST_LIMIT = 36;

type Comparison = ReturnType<typeof phaseError>;
const toUserSide = (c: Comparison, mirrored: boolean): Comparison =>
  mirrored ? { ...c, jointErrors: c.jointErrors.map(e => ({ ...e, joint: mirrorJoint(e.joint) })) } : c;

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
  private previousErrors = new Set<string>();
  private interrupted = false;
  private sections: MovementSection[];
  private finished?: ContinuousResult;
  private options: Required<PracticeOptions>;
  constructor(private pose: TemporalPose, options: PracticeOptions = {}) {
    this.options = { mirror: true, holdHysteresis: true, holdGraceMs: PERSISTENT_ERROR_MS, ...options };
    this.sections = pose.phases.slice(0,-1).map(() => ({observed:false,matched:false,errors:{}}));
  }
  reset() {
    this.phase=0; this.last=-Infinity; this.previousObserved=false; this.previousFinal=false; this.mirrored=false;
    this.held=0; this.lastFinalMatchAt=-Infinity; this.inHold=false; this.pendingPhase=-1; this.previousErrors.clear();
    this.interrupted=false; this.finished=undefined;
    this.sections=this.pose.phases.slice(0,-1).map(()=>({observed:false,matched:false,errors:{}}));
  }
  private snapshot() { return this.sections.map(s=>({...s,errors:Object.fromEntries(Object.entries(s.errors).map(([k,v])=>[k,{...v}]))})); }
  private resetHold() { this.held=0; this.previousFinal=false; this.inHold=false; this.lastFinalMatchAt=-Infinity; }
  /** Robust phase recognition uses most joints; all visible joints still contribute to error scoring. */
  private recognitionCosts(comparisons: Comparison[]) {
    return comparisons.map((s,i)=>{
      if(!s.observable)return Infinity;
      const residuals=s.jointErrors.map(e=>e.degrees/this.pose.phases[i].scale[FEATURES.indexOf(e.joint)]).sort((a,b)=>a-b);
      const use=residuals.slice(0,Math.max(3,Math.ceil(residuals.length*.75)));
      return use.reduce((sum,v)=>sum+v*v,0)/use.length;
    });
  }
  private matches(stats: Comparison, index: number) {
    return stats.observable && stats.jointErrors.every(e=>!e.outsideTolerance) && stats.normalizedError<=this.pose.phases[index].threshold;
  }
  update(angles: PoseAngles, timestamp: number, visible=true): ContinuousResult {
    if(this.finished) return this.finished;
    const base = {phase:this.phase,total:this.pose.phases.length,errorDegrees:null,normalizedError:null,
      jointErrors:[],heldMs:0,sections:this.snapshot()};
    if(!Number.isFinite(timestamp) || timestamp<=this.last) return {...base,status:'tracking',message:'Waiting for the camera…'};
    const gap=timestamp-this.last;
    const dt=this.previousObserved && gap<=500?gap:0;
    if(Number.isFinite(this.last) && gap>500) {this.interrupted=true;this.resetHold();this.previousErrors.clear();this.pendingPhase=-1;}
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
    if(!visible || !Number.isFinite(minimum) || minimum>TRACKING_COST_LIMIT) {
      this.interrupted=true;this.resetHold();this.previousObserved=false;this.previousErrors.clear();this.pendingPhase=-1;
      return {...base,status:'tracking',message:'Keep your whole body in view.'};
    }
    this.mirrored=chosen.mirrored;
    this.previousObserved=true;
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
    const stats=toUserSide(comparisons[candidate],chosen.mirrored);
    const errors=stats.jointErrors.filter(e=>e.outsideTolerance);
    const matched=this.matches(stats,candidate);
    const final=candidate===last;
    const keys=new Set<string>();
    if(!final) {
      const section=this.sections[candidate];section.observed=true;section.matched ||= matched;
      for(const error of errors) {
        const direction=error.signedDegrees>0?'high':'low';
        const key=`${candidate}:${error.joint}:${direction}`;keys.add(key);
        const entry=section.errors[key]??{durationMs:0,error};
        if(this.previousErrors.has(key))entry.durationMs+=dt;
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
      mirrored:chosen.mirrored,status,
      message:status==='matching'?(final?'Hold steady and breathe.':'Good — keep going.')
        : `${correctionFor(errors[0]??stats.jointErrors[0])}${final?', then hold.':'.'}`};
    if(this.held>=FINAL_HOLD_MS) {
      const summary=summarizeAttempt(this.sections,this.interrupted,this.pose);
      this.finished={...current,status:'complete',summary,message:'Final pose held. Well done.'};
      return this.finished;
    }
    return current;
  }
}

const location=(i:number,count:number)=>i/Math.max(1,count-1)<.34?'early':i/Math.max(1,count-1)<.67?'middle':'late';
const LOCATION_PHRASE: Record<string,string>={early:'Early in the movement',middle:'Midway through the movement',late:'Near the end of the movement'};

export function summarizeAttempt(sections: MovementSection[], trackingInterrupted: boolean, pose?: TemporalPose): AttemptSummary {
  const missing=sections.flatMap((s,i)=>s.observed?[]:[i]);
  const needsCorrection=sections.flatMap((s,i)=>s.observed && (!s.matched || Object.values(s.errors).some(e=>e.durationMs>=PERSISTENT_ERROR_MS))?[i]:[]);
  const grouped=new Map<string,{error:JointError;locations:Set<string>;durationMs:number}>();
  sections.forEach((s,i)=>Object.values(s.errors).filter(e=>e.durationMs>=PERSISTENT_ERROR_MS).forEach(({error,durationMs})=>{
    const key=error.joint+(error.signedDegrees>0?'high':'low');
    const item=grouped.get(key)??{error,locations:new Set<string>(),durationMs:0};
    item.locations.add(location(i,sections.length));
    item.durationMs+=durationMs;
    grouped.set(key,item);
  }));
  // Most persistent first: the spoken review keeps only the top few (see SPOKEN_CORRECTIONS).
  const corrections=[...grouped.values()].sort((a,b)=>b.durationMs-a.durationMs).map(({error,locations})=>{
    const when=locations.size===1?LOCATION_PHRASE[[...locations][0]]:'At several points in the movement';
    return `${when}, ${correctionFor(error).toLowerCase()}.`;
  });
  const verified=missing.length===0 && needsCorrection.length===0 && !trackingInterrupted;
  // Kept for reports/diagnostics only; the spoken and written guidance avoids stage labels.
  const missingDescriptions=missing.map(i=>{
    if(i===0)return 'the starting position';
    const where=location(i,sections.length);
    if(!pose)return `the ${where} movement`;
    const changes=FEATURES.map((joint,k)=>({joint,change:pose.phases[i].mean[k]!==null && pose.phases[i-1].mean[k]!==null
      ? Math.abs(pose.phases[i].mean[k]!-pose.phases[i-1].mean[k]!) : 0})).sort((a,b)=>b.change-a.change);
    const joint=changes[0];
    return joint.change<5?`the ${where} body alignment`:`the ${where} ${joint.joint.replace(/([A-Z])/g,' $1').toLowerCase()} movement`;
  });
  const speech=['Well done, you held the final pose.',
    ...corrections.slice(0,SPOKEN_CORRECTIONS),
    needsCorrection.length && !corrections.length?'Parts of the movement were outside the learned range. Move slowly with the demonstration next time.':'',
    missing.length?'Part of the movement was not clearly seen.':'',
    trackingInterrupted?'The camera briefly lost sight of you.':'',
    verified?'Your movement matched the reference throughout.':''].filter(Boolean).join(' ');
  return {finalHeld:true,verified,missing,missingDescriptions,needsCorrection,corrections,trackingInterrupted,speech};
}
