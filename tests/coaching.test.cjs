const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../ml/pipeline.cjs');
const {FEATURES}=require('../src/services/temporalPose.ts');
const {classifyErrors,ErrorPersistence,wristElevation}=require('../src/services/errorClassifier.ts');
const {MovementCoach}=require('../src/services/movementCoach.ts');
const {highlightedJoints}=require('../src/services/learnedGuidance.ts');
const reference={shoulderDifference:30,trainingVideos:6,variant:'arms-overhead'};
const angles=(l=100,r=100)=>Object.fromEntries(FEATURES.map((k,i)=>[k,i===4?l:i===5?r:175]));
const phase=(v)=>({mean:FEATURES.map((k,i)=>i===4||i===5?v:175),scale:Array(8).fill(5),threshold:2});
const pose={name:'Tadasana',trainingVideos:6,phases:[phase(20),phase(90),phase(170)],joints:FEATURES.map((k,i)=>i===4||i===5?{role:'moving',from:20,to:170,band:[0,180],maxReturn:30}:{role:'steady',band:[150,180]})};
const result={status:'matching',phase:1,total:3,jointErrors:[],sections:[],heldMs:0,message:'',errorDegrees:0,normalizedError:0};
test('lagging arms use anatomical side, independent of canonical pose orientation',()=>{
  for(const mirrored of [false,true])for(const side of ['left','right']){
    const d=classifyErrors(pose,{...result,mirrored},angles(side==='left'?40:120,side==='right'?40:120),reference);
    assert.equal(d.candidates[0].errorType,`${side.toUpperCase()}_ARM_LAGGING`);
    assert.match(d.candidates[0].correction,new RegExp(`Raise your ${side} arm`));
    assert.ok(d.candidates[0].landmarkIndices.includes(side==='left'?15:16));
  }
});
test('correct symmetric movement at multiple progress values causes no asymmetry correction',()=>{
  for(const v of [20,40,80,120,170])assert.equal(classifyErrors(pose,result,angles(v,v+10),reference).candidates.length,0);
});
test('untrained relationship and occluded shoulder never fabricate lag',()=>{
  assert.equal(classifyErrors(pose,result,angles(120,40)).candidates.length,0);
  assert.equal(classifyErrors(pose,result,{...angles(),rightShoulder:null},reference).candidates.length,0);
  assert.equal(classifyErrors(pose,{...result,status:'tracking'},angles(120,40),reference).candidates.length,0);
});
test('persistence uses elapsed time at 8, 15 and 30 fps and preserves resolved history',()=>{
  for(const fps of [8,15,30]){
    const p=new ErrorPersistence(),step=1000/fps;let first=null,d;
    for(let t=0;t<1000;t+=step){d=p.update(classifyErrors(pose,result,angles(120,40),reference),t,true);if(d.active.length&&first===null)first=t;}
    assert.ok(first>=500&&first<500+step+1);
    d=p.update(classifyErrors(pose,result,angles(),reference),1100,true);
    assert.equal(d.active.length,0);assert.equal(d.resolved.length,1);assert.equal(p.observedErrors().length,1);
  }
});
test('tracking loss resets persistence without reporting a correction as resolved',()=>{
  const p=new ErrorPersistence();
  const bad=()=>classifyErrors(pose,result,angles(120,40),reference);
  p.update(bad(),0,true);p.update(bad(),250,true);assert.equal(p.update(bad(),500,true).active.length,1);
  assert.deepEqual(p.update(bad(),600,false).resolved,[]);
  assert.equal(p.update(bad(),700,true).active.length,0);
  assert.equal(p.update(bad(),700,true).active.length,0);
});
test('one occluded shoulder suspends an active error without false positive reinforcement',()=>{
  const p=new ErrorPersistence();
  for(const t of [0,250,500])p.update(classifyErrors(pose,result,angles(120,40),reference),t,true);
  const d=p.update(classifyErrors(pose,result,{...angles(120,40),rightShoulder:null},reference),600,true);
  assert.equal(d.active.length,0);assert.equal(d.resolved.length,0);
});
test('unsupported tree overhead variant is reported instead of averaged into chest reference',()=>{
  const chest={...pose,name:'Vrikshasana',phases:[phase(20),phase(40),phase(50)]};
  const d=classifyErrors(chest,result,angles(170,170));
  assert.match(d.unsupportedVariant,/not supported/);assert.equal(d.candidates.length,0);
});
test('torso-normalized wrist measurement is scale/translation/mirror invariant and visibility gated',()=>{
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:1}));
  world[11]={x:.2,y:0,z:0,visibility:1};world[23]={x:.2,y:1,z:0,visibility:1};world[15]={x:.5,y:-1,z:0,visibility:1};
  assert.equal(wristElevation(world,'left'),1);
  assert.equal(wristElevation(world.map(p=>({...p,x:3-2*p.x,y:4+2*p.y,z:2*p.z})),'left'),1);
  world[15].visibility=.2;assert.equal(wristElevation(world,'left'),null);
});
test('contradictory or missing wrist geometry suppresses directional arm advice',()=>{
  const d=classifyErrors(pose,result,angles(120,40),reference,[]);
  assert.equal(d.candidates.length,0);assert.ok(d.suppressed.length);
});
test('all four poses classify observable bent knees and elbows; hip angle alone is not torso direction',()=>{
  for(const name of ['Tadasana','Vrikshasana','Trikasana','Bhujasana']){
    const err=(joint)=>({joint,degrees:40,signedDegrees:-40,actual:130,target:170,tolerance:20,outsideTolerance:true});
    const d=classifyErrors({...pose,name},{...result,jointErrors:[err('rightKnee'),err('leftElbow'),err('rightHip')]},angles());
    assert.equal(d.candidates.length,2);assert.ok(d.suppressed.some(s=>s.includes('rightHip')));
  }
});
test('tree lifting-leg progression and mirrored supporting knee have distinct directions',()=>{
  const e={joint:'leftKnee',degrees:50,signedDegrees:50,actual:150,target:100,tolerance:20,outsideTolerance:true};
  assert.match(classifyErrors({...pose,name:'Vrikshasana'},{...result,jointErrors:[e]},angles()).candidates[0].correction,/Bend your left lifting knee/);
  const bent={...e,joint:'rightKnee',signedDegrees:-40,target:170,actual:130};
  assert.match(classifyErrors({...pose,name:'Vrikshasana'},{...result,mirrored:true,jointErrors:[bent]},{...angles(),leftKnee:80}).candidates[0].correction,/right supporting knee/);
});
test('end to end lag persists, highlights the affected arm, clears, and remains in final summary',()=>{
  const c=new MovementCoach(pose,reference);
  c.update(angles(20,20),0);
  let r;for(let t=100;t<=900;t+=100)r=c.update(angles(100,40),t);
  assert.match(r.message,/Raise your right arm/);assert.ok(highlightedJoints(r).includes(16));
  r=c.update(angles(100,100),1000);assert.equal(r.coaching.active.length,0);
  for(let t=1100;t<=3200;t+=100)r=c.update(angles(170,170),t);
  assert.equal(r.status,'complete');assert.equal(r.summary.correct,false);
  assert.ok(r.summary.corrections.some(s=>s.includes('Raise your right arm')));
});
