import type { Landmark } from '../types/pose';
import type { PoseAngles } from './poseAngles';
import { ContinuousPractice, type ContinuousResult } from './continuousPractice';
import type { TemporalPose } from './temporalPose';
import { classifyErrors, ErrorPersistence, type CoachingDiagnostics, type RelationshipReference } from './errorClassifier';

export type CoachedResult = ContinuousResult & { coaching: CoachingDiagnostics };
/** Existing tracker owns phases/hold; this controller owns persistent, actionable feedback. */
export class MovementCoach {
  private tracker: ContinuousPractice;
  private persistence=new ErrorPersistence();
  private done?:CoachedResult;
  constructor(private pose:TemporalPose,private reference?:RelationshipReference['poses'][string]){
    this.tracker=new ContinuousPractice(pose);
  }
  reset(){this.tracker.reset();this.persistence=new ErrorPersistence();this.done=undefined;}
  update(angles:PoseAngles,now:number,visible=true,world?:Landmark[]):CoachedResult {
    if(this.done)return this.done;
    const result=this.tracker.update(angles,now,visible);
    const classified=classifyErrors(this.pose,result,angles,this.reference,world);
    const coaching=this.persistence.update(classified,now,result.status!=='tracking'&&!classified.unsupportedVariant,
      !!result.movementEngaged && result.phase<result.total-1);
    const primary=coaching.active[0];
    const next:CoachedResult={...result,coaching};
    if(result.status!=='complete'&&result.status!=='tracking') {
      next.message=coaching.unsupportedVariant??primary?.correction??(coaching.resolved.length?'That alignment is back in range.':result.status==='matching'?result.message:'Follow the demonstration at a comfortable pace.');
      // Highlight only persistent supported errors, not every raw model residual.
      next.status=primary?'adjust':result.status==='adjust'?'tracking':result.status;
    }
    if(next.summary){
      const observed=this.persistence.observedErrors();
      const corrections=[...new Set([...next.summary.corrections,...observed.map(e=>e.correction)])];
      next.summary={...next.summary,corrections};
      if(observed.length){next.summary.verdict='needs-correction';next.summary.correct=false;
        next.summary.speech=`You held the final pose. During the movement: ${corrections.slice(0,3).join(' ')}${next.summary.missing.length?' Some movement was not observed.':''}`;}
      this.done=next;
    }
    return next;
  }
}
