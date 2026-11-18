import type { Landmark } from '../types/pose';
import type { PoseAngles } from './poseAngles';
import { FEATURES, mirrorJoint, type TemporalPose } from './temporalPose';
import type { ContinuousResult } from './continuousPractice';

export interface RelationshipReference {
  version: 1; modelKey: string; featureSchema: 'bilateral-shoulder-difference-v1';
  poses: Record<string, { shoulderDifference: number; trainingVideos: number; variant: string }>;
}
export interface ClassifiedError {
  id: string; pose: string; phase: number; errorType: string;
  affectedJoints: string[]; landmarkIndices: number[]; severity: number;
  /** Evidence completeness, NOT a calibrated probability of correctness. */
  confidence: number; correction: string; evidence: Record<string, number>;
  persistenceMs: number; state: 'candidate' | 'active' | 'resolved';
}
export interface CoachingDiagnostics {
  progress: Record<string, number>; candidates: ClassifiedError[]; active: ClassifiedError[];
  suppressed: string[]; resolved: string[]; unavailableJoints?: string[]; unsupportedVariant?: string;
}
const chains: Record<string, number[]> = {
  leftKnee:[23,25,27],rightKnee:[24,26,28],leftElbow:[11,13,15],rightElbow:[12,14,16],
  leftShoulder:[11,13,15],rightShoulder:[12,14,16],leftHip:[11,23,25],rightHip:[12,24,26],
};
/** Torso-relative wrist height, invariant to translation, body size and image mirroring. */
export function wristElevation(points: Landmark[], side: 'left'|'right'): number | null {
  const [s,w,h]=side==='left'?[11,15,23]:[12,16,24];
  if(![s,w,h].every(i=>points[i]?.visibility>=.6 && [points[i].x,points[i].y,points[i].z].every(Number.isFinite)))return null;
  const shoulder=points[s], wrist=points[w], hip=points[h];
  const axis=[shoulder.x-hip.x,shoulder.y-hip.y,shoulder.z-hip.z];
  const norm=axis.reduce((v,x)=>v+x*x,0);
  if(norm<1e-6)return null;
  return ((wrist.x-shoulder.x)*axis[0]+(wrist.y-shoulder.y)*axis[1]+(wrist.z-shoulder.z)*axis[2])/norm;
}

export function classifyErrors(pose: TemporalPose, result: ContinuousResult, angles: PoseAngles,
  reference?: RelationshipReference['poses'][string], world?: Landmark[]): CoachingDiagnostics {
  const candidates: ClassifiedError[]=[], suppressed:string[]=[], progress:Record<string,number>={};
  if(result.status==='tracking')return {progress,candidates,active:[],suppressed:['Tracking unavailable; corrections suspended.'],resolved:[]};
  const canonical=(k:typeof FEATURES[number])=>result.mirrored?mirrorJoint(k):k;
  const finalShoulders=pose.phases[pose.phases.length-1]?.mean.slice(4,6);
  if(pose.name==='Vrikshasana' && finalShoulders?.every(v=>v!==null&&v<90) &&
    angles.leftShoulder!==null && angles.rightShoulder!==null && angles.leftShoulder>120 && angles.rightShoulder>120)
    return {progress,candidates,active:[],suppressed:['Overhead arm variant is absent from the fitted references.'],resolved:[],
      unsupportedVariant:'This reference uses hands at chest level. The overhead-arm variation is not supported yet.'};
  pose.joints?.forEach((role,k)=>{
    const joint=canonical(FEATURES[k]), actual=angles[joint];
    if(role.role==='moving' && actual!==null && Math.abs(role.to-role.from)>=30)
      progress[joint]=Math.max(0,Math.min(1,(actual-role.from)/(role.to-role.from)));
  });
  const add=(type:string,joints:string[],correction:string,severity:number,evidence:Record<string,number>)=>{
    candidates.push({id:`${pose.name}:${type}`,pose:pose.name,phase:result.phase,errorType:type,affectedJoints:joints,
      landmarkIndices:[...new Set(joints.flatMap(j=>chains[j]??[]))],severity:Math.min(3,severity),confidence:1,
      correction,evidence,persistenceMs:0,state:'candidate'});
  };
  // Activate bilateral timing only where correct training recordings support it. Other variants
  // (especially tree arms at chest vs overhead) must not inherit Tadasana's constraint.
  if(pose.name==='Tadasana' && reference) {
    const l=angles.leftShoulder,r=angles.rightShoulder;
    if(l!==null && r!==null && Math.abs(l-r)>reference.shoulderDifference) {
      const side=l<r?'left':'right';
      const wl=world?wristElevation(world,'left'):null, wr=world?wristElevation(world,'right'):null;
      // When geometry exists it must corroborate the angular claim. Caches of angles alone
      // are reported as a single-feature proxy in offline evaluation.
      if(world && (wl===null || wr===null || (l-r)*(wl-wr)<=0))suppressed.push('Arm asymmetry lacks reliable wrist corroboration.');
      else add(`${side.toUpperCase()}_ARM_LAGGING`,[`${side}Shoulder`,`${side}Elbow`],`Raise your ${side} arm higher to match your ${side==='left'?'right':'left'}.`,
        Math.abs(l-r)/reference.shoulderDifference,{shoulderDifference:l-r,threshold:reference.shoulderDifference,...(wl!==null&&wr!==null?{wristDifference:wl-wr}:{})});
    }
  }
  for(const e of result.jointErrors.filter(e=>e.outsideTolerance)) {
    const side=e.joint.startsWith('left')?'left':'right', part=e.joint.replace(side,'');
    if(angles[e.joint]===null)continue;
    if(candidates.some(c=>c.affectedJoints.includes(e.joint)))continue;
    const final=result.phase===result.total-1;
    let text='',type='';
    if(part==='Knee') {
      if(e.signedDegrees<0 && e.target>=150) {
        const other=angles[`${side==='left'?'right':'left'}Knee`];
        const supporting=pose.name==='Vrikshasana' && other!==null && other<e.target-30;
        text=supporting?`Straighten your ${side} supporting knee slightly.`:`Straighten your ${side} knee slightly.`;type='KNEE_BENT';
      } else if(pose.name==='Vrikshasana' && e.signedDegrees>0 && e.target<140) {
        text=`Bend your ${side} lifting knee toward the demonstrated position.`;type='LIFTING_LEG_PROGRESSION';
      }
    } else if(part==='Elbow') {
      text=e.signedDegrees<0?`Straighten your ${side} elbow slightly.`:`Bend your ${side} elbow slightly.`;type='ELBOW_EXTENSION';
    } else if(part==='Shoulder' && (final || pose.name==='Trikasana' || pose.name==='Bhujasana')) {
      text=e.signedDegrees<0?`Move your ${side} upper arm farther from your torso.`:`Bring your ${side} upper arm closer to your torso.`;type='ARM_ALIGNMENT';
    }
    // A hip angle alone cannot tell forward lean from sideways bend, or chest height.
    // Do not turn that ambiguity into a confident torso-direction instruction.
    if(text)add(`${side.toUpperCase()}_${type}`,[e.joint],text,1+e.degrees/Math.max(5,e.tolerance),{actual:e.actual,target:e.target,deviation:e.signedDegrees,tolerance:e.tolerance});
    else suppressed.push(`${e.joint}: deviation does not establish an actionable physical direction.`);
  }
  candidates.sort((a,b)=>b.severity-a.severity || a.id.localeCompare(b.id));
  return {progress,candidates,active:[],suppressed,resolved:[],unavailableJoints:FEATURES.filter(k=>angles[k]===null)};
}

/** Elapsed-time persistence; missing observations neither resolve nor accumulate errors. */
export class ErrorPersistence {
  private pending=new Map<string,{since:number;last:number;error:ClassifiedError}>();
  private history=new Map<string,ClassifiedError>();
  private last=-Infinity;
  constructor(private persistMs=500,private maxGapMs=500){}
  update(d:CoachingDiagnostics,now:number,observable:boolean,remember=true):CoachingDiagnostics {
    if(!Number.isFinite(now)||now<=this.last)return {...d,active:[],suppressed:[...d.suppressed,'Stale timestamp.']};
    const gap=now-this.last;this.last=now;
    if(!observable||gap>this.maxGapMs)this.pending.clear();
    if(!observable)return {...d,active:[]};
    const ids=new Set(d.candidates.map(c=>c.id)),resolved:string[]=[];
    for(const [id,p] of this.pending)if(!ids.has(id)){
      if(p.error.state==='active'&&!p.error.affectedJoints.some(j=>d.unavailableJoints?.includes(j))&&!d.suppressed.some(s=>s.includes('corroboration')))resolved.push(id);
      this.pending.delete(id);
    }
    const active:ClassifiedError[]=[];
    for(const c of d.candidates){
      const p=this.pending.get(c.id)??{since:now,last:now,error:c};
      const error={...c,persistenceMs:now-p.since,state:now-p.since>=this.persistMs?'active' as const:'candidate' as const};
      this.pending.set(c.id,{...p,last:now,error});
      if(error.state==='active'){active.push(error);if(remember)this.history.set(c.id,error);}
      else d.suppressed.push(`${c.id}: waiting for ${this.persistMs} ms persistence.`);
    }
    return {...d,active,resolved};
  }
  observedErrors(){return [...this.history.values()];}
}
