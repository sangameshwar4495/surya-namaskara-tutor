const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(output, filename);
};
const { calculateAngle } = require('../src/services/angleCalculator.ts');
const { processDetection } = require('../src/services/processDetection.ts');
const { evaluatePose } = require('../src/services/practiceEvaluator.ts');
const { PRACTICE_POSES } = require('../src/data/practicePoses.ts');
const { poses } = require('../src/data/poses.ts');
const { calculatePoseAngles } = require('../src/services/poseAngles.ts');
const { practiceFraming } = require('../src/services/practiceFraming.ts');
const { navigateSession, confirmManual, resetStep } = require('../src/services/practiceSession.ts');
const { startSession, tickSession, sampleSession } = require('../src/services/practiceSession.ts');
const p = (x, y, z = 0) => ({ x, y, z, visibility: 1 });

function prayer() {
  const landmarks = Array.from({ length: 33 }, () => p(0.5, 0.5));
  Object.entries({
    0: p(.5,.12), 11: p(.4,.3), 12: p(.6,.3),
    13: p(.35,.43), 14: p(.65,.43), 15: p(.48,.38), 16: p(.52,.38),
    23: p(.44,.55), 24: p(.56,.55), 25: p(.45,.72), 26: p(.55,.72),
    27: p(.46,.9), 28: p(.54,.9),
  }).forEach(([index, point]) => landmarks[index] = point);
  return { landmarks, inFrame: true, message: 'Person detected', receivedAt: 0,
    angles: { leftKnee: 175, rightKnee: 175, leftHip: 175, rightHip: 175,
      leftElbow: 70, rightElbow: 70, leftShoulder: 30, rightShoulder: 30 } };
}
function prepared(s = startSession(-1000)) {
  const start = s.until;
  for (let time = start; time <= start + 4000; time += 100) s = sampleSession(s,time,false,true);
  return s;
}
function held(start) {
  let s = sampleSession(start, start.until, true);
  for (let time = start.until + 100; time <= start.until + 5000; time += 100) s = sampleSession(s, time, true);
  return s;
}

test('3D angles and invalid geometry', () => {
  assert.equal(calculateAngle(p(0,0,1),p(0,0,0),p(1,0,0)),90);
  assert.equal(calculateAngle(p(-1,0),p(0,0),p(1,0)),180);
  assert.equal(calculateAngle(p(0,0),p(0,0),p(1,0)),null);
  assert.equal(calculateAngle(p(NaN,0),p(0,0),p(1,0)),null);
});
test('angles use world coordinates while display keeps normalized coordinates', () => {
  const image = prayer().landmarks;
  const world = image.map(point => ({ ...point }));
  world[23] = p(0,0,1); world[25] = p(0,0,0); world[27] = p(1,0,0);
  const result = processDetection({ results: [{ landmarks: [image], worldLandmarks: [world] }] }, true, 100);
  assert.equal(result.angles.leftKnee,90);
  assert.equal(result.landmarks[11].x, 1-image[11].y);
  assert.equal(result.receivedAt,100);
});
test('missing world landmarks and malformed coordinates do not produce valid angles', () => {
  const image = prayer().landmarks;
  assert.equal(processDetection({ results: [{ landmarks: [image] }] }, false, 0).angles.leftKnee,null);
  const world = image.map(point => ({ ...point }));
  delete world[25].x;
  assert.equal(processDetection({ results: [{ landmarks: [image], worldLandmarks: [world] }] }, false, 0).angles.leftKnee,null);
  assert.equal(processDetection(null,false,0).inFrame,false);
});
test('confident prayer pose earns a hold', () => assert.equal(evaluatePose(prayer(),0).ready,true));
test('hands apart, low wrists, bent knees, and low confidence block prayer hold', () => {
  const mutations = [
    r => r.landmarks[15].x = .2,
    r => { r.landmarks[15].y = .7; r.landmarks[16].y = .7; },
    r => r.angles.leftKnee = 100,
    r => r.landmarks[16].visibility = .2,
    r => r.angles.rightHip = null,
    r => r.landmarks[15].x = NaN,
    r => r.inFrame = false,
  ];
  for (const mutate of mutations) { const r = prayer(); mutate(r); assert.equal(evaluatePose(r,0).ready,false); }
});
test('side-view backbend requires overhead arms and extended elbows', () => {
  assert.equal(evaluatePose(prayer(),1).ready,false);
  const r = standingPose(1);
  assert.equal(evaluatePose(r,1).ready,true);
  r.angles.rightElbow = 100;
  assert.equal(evaluatePose(r,1).ready,false);
});
test('preparation never earns hold credit', () => {
  const s = prepared();
  assert.equal(sampleSession(s,3000,true,true).heldMs,0);
  assert.equal(tickSession(s,2999,2).phase,'prepare');
  assert.equal(tickSession(s,3000,2).phase,'holding');
});
test('continuous five-second hold succeeds, advances once, then completes after second hold', () => {
  let s = held(tickSession(prepared(),3000,2));
  assert.equal(s.phase,'success');
  assert.equal(s.heldMs,5000);
  assert.equal(tickSession(s,9499,2).poseIndex,0);
  s = tickSession(s,9500,2);
  assert.equal(s.poseIndex,1); assert.equal(s.phase,'setup'); assert.equal(s.heldMs,0);
  s = held(tickSession(prepared(s),13500,2));
  s = tickSession(s,20000,2);
  assert.equal(s.phase,'complete');
  assert.equal(tickSession(s,30000,2).poseIndex,1);
});
test('brief incorrect frames pause a partial hold without counting interruption', () => {
  let s = tickSession(prepared(),3000,2);
  s = sampleSession(s,3000,true); s = sampleSession(s,3200,true);
  assert.equal(s.heldMs,200);
  s = sampleSession(s,3300,false);
  assert.equal(s.heldMs,200);
  s = sampleSession(s,3400,true);
  assert.equal(s.heldMs,200);
  assert.equal(sampleSession(s,3500,true).heldMs,300);
});
test('missing callbacks never earn time and reset progress', () => {
  let s = tickSession(prepared(),3000,2);
  s = sampleSession(s,3000,true); s = sampleSession(s,3200,true);
  assert.equal(sampleSession(s,5000,true).heldMs,0);
  assert.equal(tickSession(s,3701,2).heldMs,200);
  assert.equal(tickSession(s,4000,2).heldMs,0);
  assert.equal(tickSession(s,20000,2).phase,'holding');
});
test('detector payload through evaluation and hold advances to the next pose', () => {
  const image = prayer().landmarks;
  // A planar synthetic body with uniform metric scaling, independent of image scaling.
  const world = image.map(point => p(point.x * 2, point.y * 2));
  const payload = { results: [{ landmarks: [image], worldLandmarks: [world] }] };
  let s = tickSession(prepared(),3000,2);
  for (let time = 3000; time <= 8000; time += 100) {
    const result = processDetection(payload,false,time);
    const evaluated = evaluatePose(result,s.poseIndex);
    assert.equal(evaluated.ready,true,evaluated.message);
    s = sampleSession(s,time,evaluated.ready);
  }
  assert.equal(s.phase,'success');
  assert.equal(tickSession(s,9500,2).poseIndex,1);
});


test('setup waits for stable framing before a full three-second countdown', () => {
  let s = startSession(0);
  assert.equal(tickSession(s,30000,2).phase,'setup');
  s = sampleSession(s,100,true,false);
  assert.equal(s.phase,'setup');
  for (let time = 200; time <= 1100; time += 100) s = sampleSession(s,time,false,true);
  assert.equal(s.phase,'setup');
  s = sampleSession(s,1200,false,true);
  assert.equal(s.phase,'prepare');
  assert.equal(s.until,4200);
  assert.equal(s.heldMs,0);
});

test('framing loss or stale callbacks reset countdown', () => {
  const s = prepared();
  assert.equal(sampleSession(s,3000,false,false).phase,'setup');
  assert.equal(tickSession(s,3501,2).phase,'setup');
  let retry = sampleSession(s,3600,false,true);
  assert.equal(retry.phase,'setup');
  for (let time = 3700; time <= 4600; time += 100) retry = sampleSession(retry,time,false,true);
  assert.equal(retry.phase,'prepare');
  assert.equal(retry.until,7600);
});

test('full-body framing rejects clipped or obscured extremities', () => {
  for (const index of [0,7,8,13,14,15,16,19,20,27,28,29,30,31,32]) {
    for (const change of [{y:1.1}, {x:-.1}, {visibility:.2}, {x:NaN}]) {
      const points = prayer().landmarks;
      Object.assign(points[index],change);
      assert.equal(processDetection({results:[{landmarks:[points]}]},false,0).inFrame,false);
    }
  }
});


const { PracticeMeasurements } = require('../src/services/practiceMeasurements.ts');
function measured(filter,time,mutate = () => {},index = 0) {
 const r = prayer(); r.receivedAt = time; mutate(r); return filter.evaluate(r,index);
}
test('median smoothing pauses an outlier without issuing a posture correction', () => {
 const f = new PracticeMeasurements();
 assert.equal(measured(f,0).kind,'tracking');
 assert.equal(measured(f,100).ready,false);
 assert.equal(measured(f,200).ready,true);
 const noisy = measured(f,300,r => r.angles.leftKnee = 90);
 assert.equal(noisy.ready,false); assert.equal(noisy.kind,'adjusting');
 assert.equal(measured(f,400).ready,true);
 for (let t=500;t<=1400;t+=100) measured(f,t,r=>r.angles.leftKnee=90);
 assert.equal(measured(f,1500,r=>r.angles.leftKnee=90).kind,'posture');
});
test('accepted pose has exit tolerance but beginners must first meet entry tolerance', () => {
 const r=prayer(); r.angles.leftKnee=153;
 assert.equal(evaluatePose(r,0,false).ready,false);
 assert.equal(evaluatePose(r,0,true).ready,true);
 r.angles.leftKnee=130; assert.equal(evaluatePose(r,0,true).ready,false);
 const f=new PracticeMeasurements();
 for(let t=0;t<=300;t+=100) measured(f,t);
 assert.equal(measured(f,400,r=>r.angles.leftKnee=153).ready,true);
 for(let t=500;t<=1500;t+=100) measured(f,t,r=>r.angles.leftKnee=100);
 assert.equal(measured(f,1600,r=>r.angles.leftKnee=153).ready,false);
});
test('current tracking confidence overrides smoothed good frames immediately', () => {
 for(const mutate of [r=>r.landmarks[16].visibility=.2,r=>r.angles.leftHip=null,r=>r.inFrame=false]) {
  const f=new PracticeMeasurements(); for(let t=0;t<=300;t+=100) measured(f,t);
  const lost=measured(f,400,mutate);
  assert.equal(lost.kind,'tracking'); assert.equal(lost.ready,false);
  assert.equal(measured(f,500).ready,false);
 }
});
test('measurement history clears after gaps and pose changes', () => {
 const f=new PracticeMeasurements(); for(let t=0;t<=300;t+=100) measured(f,t);
 assert.equal(measured(f,1000).ready,false);
 assert.equal(measured(f,1100).ready,false);
 assert.equal(measured(f,1200).ready,true);
 assert.equal(measured(f,1300,()=>{},1).ready,false);
});
test('persistent interruption resets, recovery never credits the paused interval', () => {
 let s=tickSession(prepared(),3000,2);
 s=sampleSession(s,3000,true);s=sampleSession(s,3200,true);
 s=sampleSession(s,3300,false);
 assert.equal(tickSession(s,4099,2).heldMs,200);
 assert.equal(tickSession(s,4100,2).heldMs,0);
 assert.equal(sampleSession(s,4100,true).heldMs,0);
 assert.equal(sampleSession(s,4000,true).heldMs,200);
});
test('brief missing callbacks preserve progress without credit and cannot complete hold', () => {
 let s=tickSession(prepared(),3000,2);
 for(let t=3000;t<=7900;t+=100) s=sampleSession(s,t,true);
 assert.equal(s.heldMs,4900);
 s=tickSession(s,8450,2);assert.equal(s.heldMs,4900);
 s=sampleSession(s,8500,true);assert.equal(s.heldMs,4900);assert.equal(s.phase,'holding');
 s=sampleSession(s,8600,true);assert.equal(s.phase,'success');
});

function standingPose(index) {
 const r=prayer();
 if(index===1) {
  Object.entries({
   0:p(.43,.23),11:p(.44,.30),12:p(.46,.30),
   13:p(.37,.20),14:p(.39,.20),15:p(.30,.09),16:p(.32,.09),
   23:p(.59,.55),24:p(.61,.55),25:p(.54,.72),26:p(.56,.72),
   27:p(.50,.90),28:p(.52,.90),29:p(.48,.92),30:p(.50,.92),31:p(.56,.92),32:p(.58,.92)
  }).forEach(([i,v])=>r.landmarks[i]=v);
  Object.assign(r.angles,{leftHip:145,rightHip:145,leftShoulder:170,rightShoulder:170,leftElbow:170,rightElbow:170});
 }
 return r;
}
const invalidBodyPositions = [
 ['both hips bent',r=>{r.angles.leftHip=110;r.angles.rightHip=110;}],
 ['one hip bent',r=>{r.angles.rightHip=110;}],
 ['knees bent',r=>{r.angles.leftKnee=145;r.angles.rightKnee=145;}],
 ['one knee bent',r=>{r.angles.leftKnee=148;}],
 ['sideways lean',r=>{r.landmarks[11].x+=.25;r.landmarks[12].x+=.25;}],
 ['wide stance',r=>{r.landmarks[27].x=.35;r.landmarks[28].x=.65;}],
];
test('whole-body constraints apply to both poses, including after acceptance',()=>{
 for(const index of [0,1]) for(const [name,mutate] of invalidBodyPositions) {
  const r=standingPose(index);mutate(r);
  for(const accepted of [false,true]) assert.equal(evaluatePose(r,index,accepted).ready,false,index+': '+name);
 }
});
test('bending after a valid hold immediately stops credit and cannot complete either pose',()=>{
 for(const index of [0,1]) for(const [name,mutate] of invalidBodyPositions) {
  const filter=new PracticeMeasurements();
  let session={...tickSession(prepared(),3000,2),poseIndex:index};
  for(let time=3000;time<=7500;time+=100) {
   const r=standingPose(index);r.receivedAt=time;
   session=sampleSession(session,time,filter.evaluate(r,index).ready,true);
  }
  const earned=session.heldMs; assert.ok(earned>4000);
  for(let time=7600;time<=13000;time+=100) {
   const r=standingPose(index);r.receivedAt=time;mutate(r);
   const evaluation=filter.evaluate(r,index);
   assert.equal(evaluation.ready,false,index+': '+name);
   session=sampleSession(session,time,evaluation.ready,true);
   assert.ok(session.heldMs<=earned); assert.equal(session.phase,'holding');
   if(time>=8400) assert.equal(session.heldMs,0);
  }
 }
});


test('reference backbend passes while upright, forward, wrong-facing and deep folds fail',()=>{
 const valid=standingPose(1);
 assert.equal(evaluatePose(valid,1).ready,true);
 const mutations=[
  r=>{r.landmarks[11].x=.59;r.landmarks[12].x=.61;},
  r=>{r.landmarks[11].x=.66;r.landmarks[12].x=.68;},
  r=>{r.landmarks[31].x=.40;r.landmarks[32].x=.42;},
  r=>{r.landmarks[11].x=.30;r.landmarks[12].x=.32;},
  r=>{r.landmarks[11].x=.30;r.landmarks[12].x=.55;},
  r=>{r.landmarks[15].y=.40;},
  r=>{r.angles.leftKnee=130;},
  r=>{r.angles.leftElbow=120;},
 ];
 for(const mutate of mutations) for(const accepted of [false,true]) {
  const r=standingPose(1);mutate(r);assert.equal(evaluatePose(r,1,accepted).ready,false);
 }
 const obscured=standingPose(1);obscured.landmarks[31].visibility=.2;obscured.landmarks[32].visibility=.2;
 assert.equal(evaluatePose(obscured,1).kind,'tracking');
});
test('reference backbend completes through smoothing and hold, upright cannot',()=>{
 for(const upright of [false,true]) {
  const filter=new PracticeMeasurements();let session={...tickSession(prepared(),3000,2),poseIndex:1};
  for(let time=3000;time<=9000;time+=100) {
   const r=standingPose(1);r.receivedAt=time;
   if(upright){r.landmarks[11].x=.59;r.landmarks[12].x=.61;}
   session=sampleSession(session,time,filter.evaluate(r,1).ready,true);
  }
  assert.equal(session.phase,upright?'holding':'success');
  assert.equal(session.heldMs,upright?0:5000);
 }
});


const {checkSideInFrame}=require('../src/services/sideTracking.ts');
function occludedProfile(visible='left') {
 const r=standingPose(1);
 const far=visible==='left' ? [8,12,14,16,18,20,22,24,26,28,30,32] : [7,11,13,15,17,19,21,23,25,27,29,31];
 for(const i of far) r.landmarks[i].visibility=.15;
 for(const joint of ['Knee','Hip','Shoulder','Elbow']) r.angles[(visible==='left'?'right':'left')+joint]=null;
 r.inFrame=false;r.message='Keep your head, hands and both feet visible in good light';
 return r;
}
test('side-view occlusion does not reuse the frontal full-body gate',()=>{
 for(const side of ['left','right']) {
  const r=occludedProfile(side);
  assert.equal(checkSideInFrame(r.landmarks).inFrame,true);
  assert.equal(evaluatePose(r,1).ready,true);
  assert.equal(evaluatePose(r,0).ready,false);
 }
});
test('occluded profile completes through smoothing with null far-side angles',()=>{
 for(const side of ['left','right']) {
  const f=new PracticeMeasurements();let s={...tickSession(prepared(),3000,2),poseIndex:1};
  for(let t=3000;t<=9000;t+=100) {
   const r=occludedProfile(side);r.receivedAt=t;
   s=sampleSession(s,t,f.evaluate(r,1).ready,checkSideInFrame(r.landmarks).inFrame);
  }
  assert.equal(s.phase,'success');
 }
});
test('side-view framing does not accept missing, clipped or mixed limb chains',()=>{
 for(const change of [r=>r.landmarks[15].visibility=.1,r=>r.landmarks[27].visibility=.1,r=>r.landmarks[15].y=1.1,r=>r.angles.leftKnee=null]) {
  const r=occludedProfile();change(r);assert.equal(evaluatePose(r,1).kind,'tracking');
 }
 const r=occludedProfile();r.landmarks[11].visibility=.1;r.landmarks[12].visibility=.9;
 assert.equal(evaluatePose(r,1).ready,false);
});
test('visible-side wrong posture still blocks credit when the other side is hidden',()=>{
 for(const mutate of [r=>r.angles.leftKnee=130,r=>r.angles.leftElbow=100,r=>r.angles.leftHip=100,r=>r.landmarks[11].x=.7,r=>r.landmarks[15].y=.5]) {
  const r=occludedProfile();mutate(r);
  assert.equal(evaluatePose(r,1,true).ready,false);
 }
});


test('a visible bent far-side knee is checked even if its arm is occluded',()=>{
 const r=occludedProfile();for(const i of [24,26,28]) r.landmarks[i].visibility=.9;
 r.angles.rightKnee=120;
 assert.equal(evaluatePose(r,1).kind,'posture');
});

// Planar fixtures derive angles from the same coordinates, rather than assigning
// successful angle values independently of the depicted shape.
function sequenceFixture(index) {
 const pose=PRACTICE_POSES[index];
 if(pose.family==='prayer') return prayer();
 if(pose.family==='raised') return standingPose(1);
 const r=prayer();
 const shapes={
  fold:[[.55,.58],[.56,.70],[.55,.83],[.45,.35],[.45,.62],[.45,.85]],
  plank:[[.72,.42],[.73,.60],[.74,.78],[.48,.49],[.30,.55],[.13,.61]],
  cobra:[[.68,.43],[.64,.62],[.70,.77],[.48,.75],[.30,.77],[.12,.79]],
  dog:[[.66,.52],[.75,.68],[.84,.84],[.45,.25],[.29,.53],[.12,.81]],
  lunge:[[.60,.30],[.70,.55],[.76,.80],[.44,.47],[.75,.53],[.76,.83]],
  salute:[[.70,.70],[.65,.60],[.76,.82],[.45,.55],[.30,.78],[.12,.82]],
 };
 const coords=shapes[pose.family];
 [11,13,15,23,25,27].forEach((i,j)=>{
  r.landmarks[i]=p(...coords[j]);r.landmarks[i+1]=p(coords[j][0]+.01,coords[j][1]);
 });
 if(pose.family==='lunge') {
  const rear=pose.frontLeg==='left'?[26,28]:[25,27];
  r.landmarks[rear[0]]=p(.25,.75);r.landmarks[rear[1]]=p(.10,.83);
 }
 for(const [ankle,heel,toe] of [[27,29,31],[28,30,32]]) {
  r.landmarks[heel]=p(r.landmarks[ankle].x-.01,r.landmarks[ankle].y+.01);
  r.landmarks[toe]=p(r.landmarks[ankle].x+.04,r.landmarks[ankle].y+.01);
 }
 r.landmarks[0]=p(coords[0][0]+.02,Math.max(.08,coords[0][1]-.06));
 r.angles=calculatePoseAngles(r.landmarks);
 return r;
}

test('all 12 sequence entries share names, media, instructions and explicit camera/coverage metadata',()=>{
 const names=['Pranamasana','Hasta Uttanasana','Padahastasana','Ashwa Sanchalanasana','Dandasana','Ashtanga Namaskara','Bhujangasana','Parvatasana','Ashwa Sanchalanasana','Padahastasana','Hasta Uttanasana','Pranamasana'];
 assert.equal(PRACTICE_POSES.length,12);
 assert.deepEqual(PRACTICE_POSES.map(p=>p.name),names);
 assert.deepEqual(poses.map(p=>p.name),names);
 PRACTICE_POSES.forEach((pose,i)=>{
  assert.equal(pose.id,i+1);assert.ok(pose.instruction.length>20);
  assert.ok(pose.setup && pose.cameraLabel && pose.coverage && pose.subtitle);
  assert.equal(pose.media.illustration,pose.family);
  assert.equal(pose.camera,[0,11].includes(i)?'front':'side');
 });
 assert.equal(PRACTICE_POSES[3].frontLeg,'left');assert.equal(PRACTICE_POSES[8].frontLeg,'right');
 assert.deepEqual(PRACTICE_POSES.filter(p=>p.manual).map(p=>p.id),[6]);
});
test('each implemented new pose accepts a coherent geometry fixture',()=>{
 for(const i of [2,3,4,6,7,8,9]) {
  const r=sequenceFixture(i);const e=evaluatePose(r,i);
  assert.equal(practiceFraming(r,i).inFrame,true);
  assert.equal(e.ready,true,`${i+1}: ${e.message}`);
 }
});
test('new evaluators reject standing prayer, missing tracking and missing joint angles',()=>{
 for(const i of [2,3,4,6,7,8,9]) {
  assert.equal(evaluatePose(prayer(),i).ready,false,`standing at ${i+1}`);
  const r=sequenceFixture(i);r.landmarks=[];
  assert.equal(evaluatePose(r,i).kind,'tracking');
  const missing=sequenceFixture(i);missing.angles.leftHip=null;
  assert.equal(evaluatePose(missing,i).kind,'tracking');
 }
});
test('lunge repetitions require the correct front leg and both legs visible',()=>{
 assert.equal(evaluatePose(sequenceFixture(3),8).ready,false);
 assert.equal(evaluatePose(sequenceFixture(8),3).ready,false);
 const r=sequenceFixture(3);r.landmarks[26].visibility=.1;
 assert.equal(evaluatePose(r,3).kind,'tracking');
});
test('new pose corrections stop credit for meaningful shape errors',()=>{
 const changes=[
  [2,r=>{r.landmarks[15].y=.3;}],
  [3,r=>{r.landmarks[15].y=.3;}],
  [4,r=>{r.angles.leftHip=120;}],
  [4,r=>{r.landmarks[15].x=.40;}],
  [6,r=>{r.landmarks[11].y=.74;}],
  [6,r=>{r.landmarks[23].y=.45;}],
  [7,r=>{r.landmarks[23].y=.70;}],
  [7,r=>{r.angles.leftElbow=90;}],
 ];
 for(const [i,change] of changes) {
  const r=sequenceFixture(i);change(r);
  assert.equal(evaluatePose(r,i,true).ready,false,`${i+1}`);
 }
});
test('repeated standing poses reuse all original checks',()=>{
 for(const [first,repeat] of [[0,11],[1,10]]) {
  const r=sequenceFixture(first);
  assert.deepEqual(evaluatePose(r,first),evaluatePose(r,repeat));
  r.angles.leftKnee=100;
  assert.deepEqual(evaluatePose(r,first),evaluatePose(r,repeat));
  assert.equal(evaluatePose(r,repeat).ready,false);
 }
 const handsApart=prayer();handsApart.landmarks[15].x=.2;
 assert.deepEqual(evaluatePose(handsApart,0),evaluatePose(handsApart,11));
 assert.equal(evaluatePose(handsApart,11).ready,false);
});
test('all 12 steps progress through framing, countdown, measurement filters and completion',()=>{
 let s=startSession(0),time=0;
 const filter=new PracticeMeasurements();
 for(let i=0;i<12;i++) {
  assert.equal(s.poseIndex,i);const pose=PRACTICE_POSES[i];
  for(let k=0;k<42;k++) {
   const r=sequenceFixture(i);r.receivedAt=time;
   s=sampleSession(s,time,filter.evaluate(r,i).ready,practiceFraming(r,i).inFrame);
   s=tickSession(s,time,12,pose.manual);time+=100;
  }
  if(pose.manual) {
   assert.equal(s.phase,'manual');assert.equal(s.heldMs,0);
   assert.equal(evaluatePose(sequenceFixture(i),i).kind,'manual');
   assert.equal(sampleSession(s,time,true,true).phase,'manual');
   s=confirmManual(s,time,12);
  } else {
   while(s.phase==='holding') {
    assert.ok(time<150000,'sequence should not stall');
    const r=sequenceFixture(i);r.receivedAt=time;
    s=sampleSession(s,time,filter.evaluate(r,i).ready,true);time+=100;
   }
   assert.equal(s.phase,'success');time=s.until;s=tickSession(s,time,12);
  }
  time+=100;
 }
 assert.equal(s.phase,'complete');
 assert.equal(Object.values(s.outcomes).filter(v=>v==='verified').length,11);
 assert.equal(s.outcomes[5],'manual');
});
test('navigation bounds, skipped outcomes, restart and pause resets remain truthful',()=>{
 let s=startSession(0);
 assert.equal(navigateSession(s,1,-1,12),s);
 s=navigateSession(s,100,1,12);assert.equal(s.poseIndex,1);assert.equal(s.outcomes[0],'skipped');
 s={...s,phase:'holding',heldMs:3000,lastSample:100};
 s=navigateSession(s,200,-1,12);assert.equal(s.poseIndex,0);assert.equal(s.heldMs,0);assert.equal(s.phase,'setup');
 s={...s,outcomes:{0:'verified'},heldMs:2000};
 s=resetStep(s,300);assert.equal(s.heldMs,0);assert.equal(s.outcomes[0],'verified');
 s=navigateSession({...s,poseIndex:11},400,1,12);assert.equal(s.phase,'complete');assert.equal(s.poseIndex,11);assert.equal(s.outcomes[11],'skipped');
 assert.deepEqual(startSession(500).outcomes,{});
 assert.equal(confirmManual(startSession(600),700,12).phase,'setup');
});

test('initial camera check stays visible through framing and the full three-second countdown',()=>{
 let s=startSession(0);
 assert.equal(tickSession(s,10000,12).cameraChecked,false);
 for(let t=0;t<=1000;t+=100) s=sampleSession(s,t,false,true);
 assert.equal(s.phase,'prepare');assert.equal(s.until,4000);
 for(let t=1100;t<4000;t+=100) {
  s=sampleSession(s,t,false,true);s=tickSession(s,t,12);
  assert.equal(s.cameraChecked,false);assert.equal(s.heldMs,0);
 }
 const lost=sampleSession(s,3950,false,false);
 assert.equal(lost.phase,'setup');assert.equal(lost.cameraChecked,false);
 s=sampleSession(s,4000,false,true);s=tickSession(s,4000,12);
 assert.equal(s.cameraChecked,true);assert.equal(s.phase,'holding');assert.equal(s.poseIndex,0);
 assert.equal(resetStep(s,4100).cameraChecked,true);
 const next=navigateSession(s,4200,1,12);
 assert.equal(next.cameraChecked,true);
 assert.equal(navigateSession(next,4300,-1,12).cameraChecked,true);
 assert.equal(startSession(4400).cameraChecked,false);
});
