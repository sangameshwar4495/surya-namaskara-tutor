const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fit,align}=require('../ml/pipeline.cjs');
const {FEATURES,TemporalTracker,phaseError,validateModel}=require('../src/services/temporalPose.ts');
const {referenceFor,highlightedJoints}=require('../src/services/learnedGuidance.ts');
const angles=n=>Object.fromEntries(FEATURES.map(k=>[k,n]));
const phase=n=>({mean:Array(8).fill(n),scale:Array(8).fill(5),threshold:1.5});
const pose={name:'test',trainingVideos:4,phases:[phase(30),phase(80),phase(140)]};
test('degree error and normalized error are explicit',()=>{
  const e=phaseError(Array(8).fill(40),phase(30));
  assert.equal(e.errorDegrees,10); assert.equal(e.normalizedError,2);
});
test('small deviations inside the learned joint range are accepted',()=>{
  const learned={...pose,phases:pose.phases.map(p=>({...p,scale:Array(8).fill(8),threshold:1.5}))};
  const r=new TemporalTracker(learned,true).update(angles(40),0);
  assert.equal(r.status,'matching');assert.ok(r.jointErrors.every(e=>e.tolerance===12 && !e.outsideTolerance));
});
test('a single bad joint cannot be hidden by low average error',()=>{
  const r=new TemporalTracker(pose,true).update({...angles(30),leftKnee:50},0);
  assert.ok(r.normalizedError<1.5);assert.equal(r.status,'adjust');
  assert.match(r.message,/Bend your left knee/);assert.deepEqual(highlightedJoints(r),[25]);
});
test('large training variance cannot widen joint tolerance beyond 20 degrees',()=>{
  const broad={...pose,phases:pose.phases.map(p=>({...p,scale:Array(8).fill(100),threshold:3}))};
  const r=new TemporalTracker(broad,true).update(angles(51),0);
  assert.equal(r.status,'adjust');assert.ok(r.jointErrors.every(e=>e.tolerance===20));
});
test('final hold counts only consecutive matching observations and gives directional feedback',()=>{
  const t=new TemporalTracker(pose,true);t.update(angles(30),0);t.update(angles(80),100);
  t.update(angles(140),200);assert.equal(t.update(angles(140),600).heldMs,400);
  const wrong=t.update({...angles(140),rightElbow:120},700);
  assert.equal(wrong.heldMs,0);assert.match(wrong.message,/straighten your right elbow/);
  assert.equal(t.update(angles(140),800).heldMs,0);
});
test('reference overlays match the model revision and mirror only display coordinates',()=>{
  const p={x:.2,y:.3,z:0,visibility:1};
  const model={version:1,reviewed:false,features:[...FEATURES],sequence:['test'],poses:[pose],referenceKey:'a'};
  const refs={version:1,modelKey:'a',sourceAspect:.75,poses:[{name:'test',phases:pose.phases.map(()=>({landmarks:[p]}))}]};
  assert.deepEqual(referenceFor(refs,model,'test',0),[{...p,x:.8}]);
  assert.equal(p.x,.2);assert.deepEqual(referenceFor({...refs,modelKey:'stale'},model,'test',0),[]);
});
test('every exported pose has a real training reference for every checkpoint',()=>{
  const model=require('../src/data/temporalModel.json');const refs=require('../src/data/temporalReferences.json');
  assert.equal(refs.modelKey,model.referenceKey);
  for(const pose of model.poses){const ref=refs.poses.find(r=>r.name===pose.name);
    assert.match(ref.source,/^train\//);assert.equal(ref.phases.length,pose.phases.length);
    assert.ok(ref.timestamps.every((t,i)=>i===0||t>=ref.timestamps[i-1]));
    for(const phase of ref.phases){assert.equal(phase.landmarks.length,33);assert.ok(phase.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
  }
});
test('final pose alone never skips intermediate checkpoints',()=>{
  const t=new TemporalTracker(pose,true);
  for(let time=0;time<5000;time+=100) {
    const r=t.update(angles(140),time);assert.equal(r.phase,0);assert.equal(r.status,'adjust');
  }
});
test('ordered intermediate poses then sustained final hold complete',()=>{
  const t=new TemporalTracker(pose,true);
  t.update(angles(30),0);
  t.update(angles(80),100);
  let r;
  for(let time=200;time<=1800;time+=100)r=t.update(angles(140),time);
  assert.equal(r.status,'complete');
  assert.equal(t.update(angles(80),2300).status,'adjust');
});
test('missing observations, stale frames and long gaps do not earn progress',()=>{
  const t=new TemporalTracker(pose,true);
  t.update(angles(30),0);t.update(angles(30),100);
  assert.equal(t.update({...angles(30),leftKnee:null,rightKnee:null},200).status,'tracking');
  assert.equal(t.update(angles(30),200).status,'tracking');
  assert.equal(t.update(angles(30),300).phase,1);
  assert.equal(t.update(angles(80),2000).phase,0);
  assert.equal(t.update(angles(30),2100,false).status,'tracking');
});
test('profile scoring uses a complete visible side without inventing hidden angles',()=>{
  const p={...pose,phases:pose.phases.map(p=>({...p,mean:p.mean.map((v,i)=>i%2?v:null)}))};
  const t=new TemporalTracker(p,true);
  const a=Object.fromEntries(FEATURES.map((key,i)=>[key,i%2?30:null]));
  const r=t.update(a,0);assert.equal(r.status,'matching');assert.equal(r.jointErrors.length,4);
  assert.equal(t.update({...a,rightHip:null},100).status,'tracking');
});
test('continuous invalid callbacks reset movement after prolonged tracking loss',()=>{
  const t=new TemporalTracker(pose,true);
  t.update(angles(30),0);t.update(angles(80),100);
  for(let time=200;time<=1500;time+=100)t.update(angles(140),time,false);
  const r=t.update(angles(140),1600);
  assert.equal(r.phase,0);assert.equal(r.status,'adjust');
});
test('model validation rejects corrupt scales and feature order',()=>{
  const model={version:1,reviewed:true,features:[...FEATURES],poses:[pose],sequence:['test']};
  validateModel(model);
  assert.throws(()=>validateModel({...model,features:[...FEATURES].reverse()}));
  assert.throws(()=>validateModel({...model,poses:[{...pose,phases:[phase(0),phase(0),{...phase(0),scale:Array(8).fill(0)}]}]}));
});
test('DTW aligns repeated slow frames without changing checkpoint order',()=>{
  const r=[10,60,120].map(n=>Array(8).fill(n));
  assert.deepEqual(align(r,[r[0],r[0],r[1],r[1],r[2]]),r);
});
test('fitting learns entry and final statistics from demonstrations',()=>{
  const clips=Array.from({length:4},(_,v)=>({entry:Array.from({length:24},(_,i)=>({t:i*100,angles:Array(8).fill(20+i*3+v)})),hold:Array.from({length:5},(_,i)=>({t:2400+i*100,angles:Array(8).fill(150+v)}))}));
  const m=fit('test',clips);assert.equal(m.phases.length,25);
  assert.equal(m.phases.at(-1).mean[0],152);assert.equal(m.trainingVideos,4);
});
test('end-to-end training excludes test values and evaluates incorrect labeled tests',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {run}=require('../ml/pipeline.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'yoga-pipeline-'));
  const original=process.cwd(), log=console.log;
  try {
    process.chdir(root);console.log=()=>{};
    fs.mkdirSync('ml/data',{recursive:true});fs.mkdirSync('src/data',{recursive:true});
    const rows=[];
    for(const name of ['Tadasana','Vrikshasana','Trikasana','Bhujasana','Padamasana']) {
      for(let i=0;i<5;i++) {
        const hash=name+i;
        rows.push({pose:name,split:i===4?'test':'train',path:hash,sha256:hash,correct:i!==4,startMs:0,finalMs:3000,endMs:5000,subject:hash});
        const frames=Array.from({length:51},(_,j)=>({t:j*100,angles:Array(8).fill(j<30?30+j*3:120)}));
        fs.writeFileSync(`ml/data/${hash}.json`,JSON.stringify({version:1,modelHash:'fixture',sampleFps:8,frames}));
      }
    }
    fs.writeFileSync('ml/data/manifest.json',JSON.stringify(rows));
    run([]);const first=JSON.parse(fs.readFileSync('src/data/temporalModel.json','utf8'));delete first.validation;
    const report=JSON.parse(fs.readFileSync('ml/reports/evaluation.json'));
    assert.equal(report.trainingVideos,20);assert.equal(report.testVideos,5);
    assert.ok(report.evaluation.every(r=>r.correctLabel===false));
    for(const r of rows.filter(r=>r.split==='test')) {
      const file=`ml/data/${r.sha256}.json`, cache=JSON.parse(fs.readFileSync(file));
      cache.frames.forEach(f=>f.angles=Array(8).fill(170));fs.writeFileSync(file,JSON.stringify(cache));
    }
    run([]);const second=JSON.parse(fs.readFileSync('src/data/temporalModel.json','utf8'));delete second.validation;
    assert.deepEqual(second,first);
    rows.at(-1).sha256=rows[0].sha256;
    fs.writeFileSync('ml/data/manifest.json',JSON.stringify(rows));
    assert.throws(()=>run([]),/Duplicate video/);
  } finally {
    console.log=log;process.chdir(original);
    // root is exclusively created by mkdtemp inside the OS temp directory.
    if(path.dirname(root)===path.resolve(os.tmpdir()))fs.rmSync(root,{recursive:true,force:true});
  }
});
