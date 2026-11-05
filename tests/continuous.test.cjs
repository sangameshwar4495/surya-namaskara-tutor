const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selectStages}=require('../ml/pipeline.cjs');
const {ContinuousPractice}=require('../src/services/continuousPractice.ts');
const {FEATURES}=require('../src/services/temporalPose.ts');
const a=n=>Object.fromEntries(FEATURES.map(k=>[k,n]));
const p=n=>({mean:Array(8).fill(n),scale:Array(8).fill(5),threshold:1.5});
const pose={name:'fixture',trainingVideos:4,phases:[p(30),p(80),p(140)]};
function finish(t,start=400){let r;for(let time=start;time<=start+2000;time+=100)r=t.update(a(140),time);return r;}

test('continuous movement observes intermediate sections without dwelling',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);t.update(a(80),100);
  const r=finish(t,200);assert.equal(r.status,'complete');assert.equal(r.summary.verified,true);
});
test('bad intermediate joint is recorded while phase recognition continues',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);
  for(let time=100;time<=500;time+=100){const r=t.update({...a(80),leftKnee:110},time);assert.equal(r.phase,1);assert.equal(r.status,'adjust');}
  const r=finish(t,600);assert.equal(r.status,'complete');assert.equal(r.summary.verified,false);
  assert.deepEqual(r.summary.needsCorrection,[1]);assert.match(r.summary.speech,/left knee/);
});
test('jumping to final ends attempt but never verifies missing intermediate movement',()=>{
  const t=new ContinuousPractice(pose);const r=finish(t,0);
  assert.equal(r.status,'complete');assert.deepEqual(r.summary.missing,[0,1]);assert.equal(r.summary.verified,false);
  assert.match(r.summary.speech,/not clearly seen/);
});
test('spoken and written guidance carries no stage labels or hold disclaimers',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);
  const moving=t.update({...a(80),leftKnee:110},100);
  assert.doesNotMatch(moving.message,/stage|section|checkpoint|intermediate|no need to stop/i);
  const r=finish(t,200);
  assert.doesNotMatch(r.summary.speech,/stage|section|checkpoint|intermediate|need to stop|next one/i);
});
test('tracking loss cannot count toward hold or silently verify unseen movement',()=>{
  const t=new ContinuousPractice(pose);t.update(a(30),0);t.update(a(80),100);
  t.update(a(140),200);t.update(a(140),300);
  assert.equal(t.update(a(140),400,false).heldMs,0);
  const r=finish(t,500);assert.equal(r.summary.trackingInterrupted,true);assert.equal(r.summary.verified,false);
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
  assert.equal(finish(t,200).summary.verified,true);
});
test('all persistent correction groups appear in the spoken summary',()=>{
  const t=new ContinuousPractice(pose);
  for(let time=0;time<=400;time+=100)t.update({...a(30),leftKnee:55},time);
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
  const t=new ContinuousPractice(pose);let time=0;
  const joints=['leftKnee','rightKnee','leftElbow','rightElbow'];
  joints.forEach((joint,j)=>{for(let k=0;k<=3+j;k++)t.update({...a(30),[joint]:55},time+=100);}); // rightElbow persists longest
  const r=finish(t,time+100);
  assert.equal(r.summary.corrections.length,4);
  assert.match(r.summary.corrections[0],/right elbow/);
  assert.match(r.summary.speech,/right elbow/);assert.doesNotMatch(r.summary.speech,/left knee/);
});
