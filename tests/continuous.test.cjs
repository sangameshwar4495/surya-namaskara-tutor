const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selectStages}=require('../ml/pipeline.cjs');
const {ContinuousPractice}=require('../src/services/continuousPractice.ts');
const {FEATURES}=require('../src/services/temporalPose.ts');
const a=n=>Object.fromEntries(FEATURES.map(k=>[k,n]));
const p=n=>({mean:Array(8).fill(n),scale:Array(8).fill(5),threshold:1.5});
const pose={name:'fixture',trainingVideos:4,phases:[p(30),p(80),p(140)]};
function finish(t,start=400){let r;for(let time=start;time<=start+2000;time+=100)r=t.update(a(140),time);return r;}

test('clearly tracked off-reference movement gives corrections and survives recovery in the review',()=>{
  const t=new ContinuousPractice({...pose,phases:[p(60),p(90),p(140)]});t.update(a(60),0);t.update(a(90),100);
  for(let time=200;time<=700;time+=100){
    const r=t.update(a(0),time);
    assert.equal(r.status,'adjust');
    assert.ok(r.jointErrors.some(e=>e.outsideTolerance));
    assert.doesNotMatch(r.message,/whole body in view|Good/);
  }
  const r=finish(t,800);
  assert.equal(r.status,'complete');
  assert.equal(r.summary.verdict,'needs-correction');
  assert.ok(r.summary.corrections.length>0);
});

test('persistent joint errors spanning movement sections remain in the review',()=>{
  const {summarizeAttempt}=require('../src/services/continuousPractice.ts');
  const error={joint:'leftKnee',degrees:30,signedDegrees:-30,actual:140,target:170,tolerance:10,outsideTolerance:true};
  const sections=Array.from({length:3},()=>({observed:true,matched:true,errors:{knee:{durationMs:100,error}}}));
  const summary=summarizeAttempt(sections,{trackingInterrupted:false});
  assert.equal(summary.verdict,'needs-correction');
  assert.match(summary.corrections.join(' '),/left knee/);
  const noise=summarizeAttempt(sections.map(s=>({...s,errors:{knee:{durationMs:0,error}}})),{trackingInterrupted:false});
  assert.equal(noise.verdict,'correct');
});

test('live corrections require persistence, repeat at a bounded rate and reset after gaps',()=>{
  const {LiveFeedback}=require('../src/services/liveFeedback.ts');
  const cue=new LiveFeedback();
  const wrong={status:'adjust',message:'Gently straighten your left knee'};
  assert.equal(cue.update(wrong,0),null);
  assert.equal(cue.update(wrong,250),null);
  assert.equal(cue.update(wrong,500),wrong.message);
  for(let time=750;time<5500;time+=250)assert.equal(cue.update(wrong,time),null);
  assert.equal(cue.update(wrong,5500),wrong.message);
  assert.equal(cue.update({status:'matching',message:'Good'},5750),null);
  assert.equal(cue.update(wrong,11000),null);
  assert.equal(cue.update(wrong,11250),null);
  assert.equal(cue.update(wrong,11500),wrong.message);
  assert.equal(cue.update(wrong,11500),null);
});

test('every summary verdict has explicit feedback even without a named joint correction',()=>{
  const {MOVEMENT_SPEECH}=require('../src/services/continuousPractice.ts');
  assert.match(MOVEMENT_SPEECH['needs-correction'],/needs correction/);
  assert.match(MOVEMENT_SPEECH.incomplete,/not enough/);
  assert.match(MOVEMENT_SPEECH['unable-to-assess'],/could not be checked/);
  assert.match(MOVEMENT_SPEECH.correct,/range of correct performers/);
});

test('continuous movement observes intermediate sections without dwelling',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);t.update(a(80),100);
  const r=finish(t,200);assert.equal(r.status,'complete');assert.equal(r.summary.verdict,'correct');
});
test('bad intermediate joint is recorded while phase recognition continues',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);
  for(let time=100;time<=500;time+=100){const r=t.update({...a(80),leftKnee:110},time);assert.equal(r.phase,1);assert.equal(r.status,'adjust');}
  const r=finish(t,600);assert.equal(r.status,'complete');assert.equal(r.summary.verdict,'needs-correction');
  assert.deepEqual(r.summary.needsCorrection,[1]);assert.match(r.summary.speech,/left knee/);
});
test('jumping to final ends attempt but never verifies missing intermediate movement',()=>{
  const t=new ContinuousPractice(pose);const r=finish(t,0);
  assert.equal(r.status,'complete');assert.deepEqual(r.summary.missing,[0,1]);assert.equal(r.summary.verdict,'incomplete');
  assert.match(r.summary.speech,/not enough of the movement into it was seen/);
});
test('spoken and written guidance carries no stage labels or hold disclaimers',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);
  const moving=t.update({...a(80),leftKnee:110},100);
  assert.doesNotMatch(moving.message,/stage|section|checkpoint|intermediate|no need to stop/i);
  const r=finish(t,200);
  assert.doesNotMatch(r.summary.speech,/stage|section|checkpoint|intermediate|need to stop|next one/i);
});
test('tracking loss cannot count toward hold; a loss after the movement is only a note',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);t.update(a(80),100);
  t.update(a(140),200);t.update(a(140),300);
  assert.equal(t.update(a(140),400,false).heldMs,0);
  const r=finish(t,500);assert.equal(r.summary.trackingInterrupted,true);
  // The whole movement was seen before the final pose was reached.
  assert.equal(r.summary.movementTrackingLost,false);assert.equal(r.summary.verdict,'correct');
});
test('stale timestamps cannot earn hold credit and long callback gaps reset hold',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);t.update(a(80),100);
  t.update(a(140),200);assert.equal(t.update(a(140),200).status,'tracking');
  assert.equal(t.update(a(140),1400).heldMs,0);
});
test('completed attempts stay available for summary and repeat clears all history',()=>{
  const t=new ContinuousPractice(pose);const done=finish(t,0);
  assert.equal(t.update(a(30),3000),done);t.reset();const r=t.update(a(30),4000);
  assert.equal(r.status,'matching');assert.equal(r.summary,undefined);assert.ok(r.sections.every(s=>Object.keys(s.errors).length===0));
});
test('small intermediate deviations pass learned tolerances',()=>{
  const t=new ContinuousPractice(pose);t.update(a(34),0);t.update(a(84),100);
  assert.equal(finish(t,200).summary.verdict,'correct');
});
test('all persistent correction groups appear in the spoken summary',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0); // in the starting position first
  for(let time=100;time<=400;time+=100)t.update({...a(30),leftKnee:55},time);
  for(let time=500;time<=900;time+=100)t.update({...a(80),rightElbow:55},time);
  const r=finish(t,1000);assert.equal(r.summary.corrections.length,2);
  assert.match(r.summary.speech,/left knee/);assert.match(r.summary.speech,/right elbow/);
});
test('stage count follows learned trajectory shape rather than a fixed twelve',()=>{
  const straight=Array.from({length:25},(_,i)=>p(20+i*4));
  const curved=Array.from({length:25},(_,i)=>p(60+40*Math.sin(i*.7)));
  assert.equal(selectStages(straight).length,3);
  assert.ok(selectStages(curved).length>3);
  assert.equal(selectStages(curved)[0],0);assert.equal(selectStages(curved).at(-1),24);
});

// --- Regression tests for the failure mechanisms found in ml/diagnose.cjs ---
const {mirrorFeatures,mirrorJoint}=require('../src/services/temporalPose.ts');
const {orientClips,train}=require('../ml/pipeline.cjs');
const nearFinal={...pose,phases:[p(30),p(136),p(140)]};
test('final hold survives recognition alternating with a near-identical last stage',()=>{
  // 136 vs 140 is inside the final tolerance; nearest-stage recognition alternates between them.
  const t=new ContinuousPractice(nearFinal);t.update(a(30),0);
  let r;for(let time=100;time<=2200;time+=100)r=t.update(a(time%200?137:139),time);
  assert.equal(r.status,'complete');
  const legacy=new ContinuousPractice(nearFinal,{holdHysteresis:false});legacy.update(a(30),0);
  for(let time=100;time<=2200;time+=100)r=legacy.update(a(time%200?137:139),time);
  assert.notEqual(r.status,'complete');
});
test('hysteresis never starts a hold from the starting position',()=>{
  const t=new ContinuousPractice(nearFinal);
  for(let time=0;time<=3000;time+=100)assert.equal(t.update(a(30),time).heldMs,0);
});
test('one noisy frame neither resets nor earns hold time; a persistent error resets',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);t.update(a(80),100);
  for(let time=200;time<=800;time+=100)t.update(a(140),time);
  const blip=t.update({...a(140),rightElbow:120},900);
  assert.equal(blip.heldMs,600);assert.equal(blip.status,'matching');
  assert.equal(t.update(a(140),1000).heldMs,600); // interval containing the blip earns nothing
  assert.equal(t.update(a(140),1100).heldMs,700);
  for(let time=1200;time<=1500;time+=100)t.update({...a(140),rightElbow:120},time);
  assert.equal(t.update({...a(140),rightElbow:120},1600).heldMs,0);
});
const sided=n=>({mean:[n,170,170,170,n,90,n,120],scale:Array(8).fill(5),threshold:1.5}); // left knee, shoulder and hip move
const sidePose={name:'side',trainingVideos:4,phases:[sided(170),sided(120),sided(60)]};
const userAngles=values=>Object.fromEntries(FEATURES.map((k,i)=>[k,values[i]]));
test('opposite-side performance is recognized and corrections name the user\'s real side',()=>{
  const t=new ContinuousPractice(sidePose);
  for(const [i,time] of [[0,0],[1,100]])t.update(userAngles(mirrorFeatures(sidePose.phases[i].mean)),time);
  // User lifts the RIGHT leg (mirror of the learned left-leg variant) with the right knee 20 degrees too straight.
  const wrong=mirrorFeatures(sidePose.phases[2].mean);wrong[1]+=20;
  let r;for(let time=200;time<=600;time+=100)r=t.update(userAngles(wrong),time);
  assert.equal(r.mirrored,true);assert.equal(r.status,'adjust');assert.match(r.message,/right knee/);
  for(let time=700;time<=2400;time+=100)r=t.update(userAngles(mirrorFeatures(sidePose.phases[2].mean)),time);
  assert.equal(r.status,'complete');
  const fixed=new ContinuousPractice(sidePose,{mirror:false});
  for(let time=0;time<=2400;time+=100)r=fixed.update(userAngles(mirrorFeatures(sidePose.phases[2].mean)),time);
  assert.notEqual(r.status,'complete');
  assert.equal(mirrorJoint('leftKnee'),'rightKnee');assert.equal(mirrorJoint('rightHip'),'leftHip');
});
const clip=(final,v=0)=>({record:{pose:'side'},
  entry:Array.from({length:24},(_,i)=>({t:i*100,angles:final.map((x,k)=>k===0||k===1?170-(170-x)*i/23+v:x+v)})),
  hold:Array.from({length:24},(_,i)=>({t:2400+i*100,angles:final.map(x=>x+v+(i%2))}))});
test('training orients opposite-side demonstrations to one variant and calibrates per-joint allowance',()=>{
  const left=[60,170,170,170,90,90,170,120];
  const clips=[clip(left,0),clip(left,2),clip(mirrorFeatures(left),1),clip(left,3),clip(mirrorFeatures(left),4)];
  const oriented=orientClips(clips);
  assert.deepEqual(oriented.map(c=>!!c.mirrored),[false,false,true,false,true]);
  const model=train(clips);
  const final=model.phases.at(-1);
  assert.ok(Math.abs(final.mean[0]-62)<=2 && Math.abs(final.mean[1]-172)<=2,'left-knee variant learned without averaging sides');
  assert.ok(final.jointThreshold>=final.threshold);
  const mixed=train(clips,{orient:false}).phases.at(-1);
  assert.ok(mixed.jointThreshold>final.jointThreshold,'mixing sides inflates the calibrated allowance');
});
test('spoken review keeps the three most persistent corrections; written review keeps all',()=>{
  const t=new ContinuousPractice(pose);let time=0;t.update(a(30),0); // in the starting position first
  const joints=['leftKnee','rightKnee','leftElbow','rightElbow'];
  joints.forEach((joint,j)=>{for(let k=0;k<=3+j;k++)t.update({...a(30),[joint]:55},time+=100);}); // rightElbow persists longest
  const r=finish(t,time+100);
  assert.equal(r.summary.corrections.length,4);
  assert.match(r.summary.corrections[0],/right elbow/);
  assert.match(r.summary.speech,/right elbow/);assert.doesNotMatch(r.summary.speech,/left knee/);
});

// --- In-between movement: capped learned path + learned joint roles (see ml/RESULTS.md, 2026-11-10) ---
const legacyScoring={pathTolerance:false,learnedTolerance:false,jointRoles:false,pathCoverage:false};
const spread=(n,scale)=>({mean:Array(8).fill(n),scale:Array(8).fill(scale),threshold:1.5});
test('the 20-degree cap applies to in-between movement again; the uncapped variant is opt-in only',()=>{
  // Learned in-between tolerance 20 x 1.5 = 30 degrees; a 25-degree deviation exceeds the 20-degree cap.
  const wide={name:'wide',trainingVideos:4,phases:[p(30),spread(80,20),p(140)]};
  const run=options=>{const t=new ContinuousPractice(wide,options);t.update(a(30),0);
    for(let time=100;time<=500;time+=100)t.update({...a(80),leftKnee:105},time);return finish(t,600).summary;};
  assert.ok(run().corrections.length>0,'default keeps the cap');
  assert.equal(run({learnedTolerance:true}).correct,true,'rejected uncapped variant (ablation only)');
});
test('a frame part-way along the learned path is correct movement, not an error',()=>{
  // 100 degrees lies between the learned 80 and 140 stages.
  const run=options=>{const t=new ContinuousPractice(pose,options);t.update(a(30),0);t.update(a(80),100);
    for(let time=200;time<=600;time+=100)t.update(a(100),time);return finish(t,700).summary;};
  assert.equal(run().correct,true);
  assert.ok(run(legacyScoring).corrections.length>0);
});
test('mistakes on joints that correct performers keep steady are still corrected',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);
  for(let time=100;time<=500;time+=100)t.update({...a(80),leftKnee:110},time);
  const s=finish(t,600).summary;
  assert.equal(s.correct,false);assert.match(s.corrections.join(' '),/left knee/);
});
test('the final pose keeps its 20-degree cap however wide the learned spread',()=>{
  const wideFinal={name:'wideFinal',trainingVideos:4,phases:[p(30),p(80),spread(140,20)]};
  const hold=knee=>{const t=new ContinuousPractice(wideFinal);t.update(a(30),0);t.update(a(80),100);
    let r;for(let time=200;time<=3000;time+=100)r=t.update({...a(140),leftKnee:knee},time);return r.status;};
  assert.equal(hold(155),'complete');
  assert.notEqual(hold(165),'complete');
});
test('jumping straight into the final pose is not judged a correct performance',()=>{
  const t=new ContinuousPractice(pose);const s=finish(t,0).summary;
  assert.equal(s.correct,false);assert.equal(s.verdict,'incomplete');
  assert.doesNotMatch(s.speech,/stayed within the range/);
});
test('both learned-path scoring switches off reproduce nearest-stage scoring',()=>{
  const t=new ContinuousPractice(pose,legacyScoring);t.update(a(30),0);
  const r=t.update(a(100),100);
  assert.equal(r.status,'adjust');assert.equal(r.jointErrors[0].tolerance,7.5);
});

// Roles as produced by jointRoles(): knees steady and straight, shoulders rise from 20 to 170.
// Elbows and shoulders both move: recognition ignores the worst-fitting quarter of joints, so a
// fixture moving only two joints could never be recognized as progressing.
const KNEE=[0,1], SHOULDER=[2,3,4,5];
const roleAngles=(knee,shoulder,rest=90)=>Object.fromEntries(FEATURES.map((k,i)=>[k,KNEE.includes(i)?knee:SHOULDER.includes(i)?shoulder:rest]));
const roleStage=(knee,shoulder)=>({mean:FEATURES.map((_,i)=>KNEE.includes(i)?knee:SHOULDER.includes(i)?shoulder:90),scale:FEATURES.map((_,i)=>SHOULDER.includes(i)?40:5),threshold:3});
const roles=FEATURES.map((_,i)=>KNEE.includes(i)?{role:'steady',band:[140,180]}
  :SHOULDER.includes(i)?{role:'moving',band:[0,180],from:20,to:170,maxReturn:20}:{role:'steady',band:[70,110]});
const raise={name:'raise',trainingVideos:4,phases:[roleStage(170,20),roleStage(170,95),roleStage(170,170)],joints:roles};
function raiseArms(t,{knee=()=>170,shoulder=time=>Math.min(170,20+time/10)}={}) {
  let r;for(let time=0;time<=1500;time+=100)r=t.update(roleAngles(knee(time),shoulder(time)),time);
  for(let time=1600;time<=3600;time+=100)r=t.update(roleAngles(170,170),time);return r;
}
test('a smooth correct movement passes the learned joint roles',()=>{
  const r=raiseArms(new ContinuousPractice(raise));
  assert.equal(r.status,'complete');assert.equal(r.summary.correct,true);assert.deepEqual(r.summary.corrections,[]);
});
test('bending a steady joint mid-movement is corrected by name',()=>{
  const r=raiseArms(new ContinuousPractice(raise),{knee:time=>time>=400&&time<=1000?110:170});
  assert.equal(r.summary.correct,false);assert.match(r.summary.corrections.join(' '),/straighten your (left|right) knee/);
});
test('moving back toward the start mid-movement is corrected; small wobbles are not',()=>{
  const back=raiseArms(new ContinuousPractice(raise),{shoulder:time=>time<800?20+time/5:time<=1200?60:170});
  assert.equal(back.summary.correct,false);assert.match(back.summary.corrections.join(' '),/upper arm farther from your torso/);
  const wobble=raiseArms(new ContinuousPractice(raise),{shoulder:time=>Math.min(170,20+time/10)-(time===700?15:0)});
  assert.equal(wobble.summary.correct,true);
});
test('settling near the start position is not judged as moving back',()=>{
  // Arms lift 30 degrees (under a quarter of the 150-degree movement) and drop again before the real movement.
  const r=raiseArms(new ContinuousPractice(raise),{shoulder:time=>time<=300?20+time/10:time<=500?20:Math.min(170,20+(time-500)/7)});
  assert.equal(r.summary.correct,true);
});
test('a nearly straight joint that is straighter than the training band is never corrected',()=>{
  const r=raiseArms(new ContinuousPractice(raise),{knee:()=>180});
  assert.deepEqual(r.summary.corrections,[]);
});
test('learned joint roles are optional: without them the capped learned path judges every joint',()=>{
  const {joints,...noRoles}=raise;
  const a1=raiseArms(new ContinuousPractice(noRoles),{knee:time=>time>=400&&time<=1000?110:170});
  assert.match(a1.summary.corrections.join(' '),/knee/);
});
test('training learns steady and moving roles with a leave-one-video-out margin',()=>{
  const {jointRoles}=require('../ml/pipeline.cjs');
  const clip=(v)=>({entry:Array.from({length:20},(_,i)=>({t:i*100,angles:FEATURES.map((_,k)=>KNEE.includes(k)?168+v:SHOULDER.includes(k)?20+i*7.5:90+v)})),
    hold:Array.from({length:10},(_,i)=>({t:2000+i*100,angles:FEATURES.map((_,k)=>KNEE.includes(k)?168+v:SHOULDER.includes(k)?170:90+v)}))});
  const learned=jointRoles([0,2,4,6].map(clip));
  assert.equal(learned[0].role,'steady');assert.deepEqual(learned[0].band,[153,180],'15-degree floor margin; straight side open');
  assert.equal(learned[4].role,'moving');assert.equal(learned[4].band[0],0,'start side of a moving joint stays open');
  assert.ok(learned[4].maxReturn>0 && learned[4].maxReturn<=40);
  assert.equal(learned[6].role,'steady');
});
test('getting into position is not reviewed; live guidance is still given',()=>{
  const t=new ContinuousPractice(raise);let r;
  // Kneeling-like setup: knees far outside their steady range before the movement starts.
  for(let time=0;time<=600;time+=100)r=t.update(roleAngles(100,20),time);
  assert.equal(r.status,'adjust');assert.match(r.message,/knee/);
  for(let time=700;time<=2200;time+=100)r=t.update(roleAngles(170,Math.min(170,20+(time-700)/10)),time);
  for(let time=2300;time<=4300;time+=100)r=t.update(roleAngles(170,170),time);
  assert.equal(r.status,'complete');assert.deepEqual(r.summary.corrections,[]);assert.equal(r.summary.correct,true);
  // Without learned roles the gate is off, so earlier ablation results stay reproducible.
  const {joints,...noRoles}=raise;const legacy=new ContinuousPractice(noRoles);
  for(let time=0;time<=600;time+=100)legacy.update(roleAngles(100,20),time);
  assert.ok(Object.values(legacy.update(roleAngles(100,20),700).sections[0].errors).length>0);
});
