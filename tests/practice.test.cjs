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
test('raised arms require overhead wrists and extended elbows', () => {
  const r = prayer();
  assert.equal(evaluatePose(r,1).ready,false);
  r.landmarks[15] = p(.42,.1); r.landmarks[16] = p(.58,.1);
  Object.assign(r.angles,{leftShoulder:170,rightShoulder:170,leftElbow:170,rightElbow:170});
  assert.equal(evaluatePose(r,1).ready,true);
  r.angles.rightElbow = 100;
  assert.equal(evaluatePose(r,1).ready,false);
});
test('preparation never earns hold credit', () => {
  const s = startSession(0);
  assert.equal(sampleSession(s,1000,true).heldMs,0);
  assert.equal(tickSession(s,2999,2).phase,'prepare');
  assert.equal(tickSession(s,3000,2).phase,'holding');
});
test('continuous five-second hold succeeds, advances once, then completes after second hold', () => {
  let s = held(tickSession(startSession(0),3000,2));
  assert.equal(s.phase,'success');
  assert.equal(s.heldMs,5000);
  assert.equal(tickSession(s,9499,2).poseIndex,0);
  s = tickSession(s,9500,2);
  assert.equal(s.poseIndex,1); assert.equal(s.phase,'prepare'); assert.equal(s.heldMs,0);
  s = held(tickSession(s,12500,2));
  s = tickSession(s,19000,2);
  assert.equal(s.phase,'complete');
  assert.equal(tickSession(s,30000,2).poseIndex,1);
});
test('incorrect frames reset a partial hold', () => {
  let s = tickSession(startSession(0),3000,2);
  s = sampleSession(s,3000,true); s = sampleSession(s,3200,true);
  assert.equal(s.heldMs,200);
  s = sampleSession(s,3300,false);
  assert.equal(s.heldMs,0);
  assert.equal(sampleSession(s,3400,true).heldMs,0);
});
test('missing callbacks never earn time and reset progress', () => {
  let s = tickSession(startSession(0),3000,2);
  s = sampleSession(s,3000,true); s = sampleSession(s,3200,true);
  assert.equal(sampleSession(s,5000,true).heldMs,0);
  assert.equal(tickSession(s,3701,2).heldMs,0);
  assert.equal(tickSession(s,20000,2).phase,'holding');
});
test('detector payload through evaluation and hold advances to the next pose', () => {
  const image = prayer().landmarks;
  // A planar synthetic body with uniform metric scaling, independent of image scaling.
  const world = image.map(point => p(point.x * 2, point.y * 2));
  const payload = { results: [{ landmarks: [image], worldLandmarks: [world] }] };
  let s = tickSession(startSession(0),3000,2);
  for (let time = 3000; time <= 8000; time += 100) {
    const result = processDetection(payload,false,time);
    const evaluated = evaluatePose(result,s.poseIndex);
    assert.equal(evaluated.ready,true,evaluated.message);
    s = sampleSession(s,time,evaluated.ready);
  }
  assert.equal(s.phase,'success');
  assert.equal(tickSession(s,9500,2).poseIndex,1);
});
