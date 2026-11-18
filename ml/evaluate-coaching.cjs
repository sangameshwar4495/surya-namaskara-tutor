// Full-recording comparison. Training folds fit all references without the held-out video.
const fs=require('node:fs');
const P=require('./pipeline.cjs');
const {FEATURES}=require('../src/services/temporalPose.ts');
const {ContinuousPractice}=require('../src/services/continuousPractice.ts');
const {MovementCoach}=require('../src/services/movementCoach.ts');
const {LiveFeedback}=require('../src/services/liveFeedback.ts');
const {fitRelationship}=require('./train-relationships.cjs');
const model=require('../src/data/temporalModel.json');
const relationships=require('../src/data/relationshipModel.json');
const manifest=JSON.parse(fs.readFileSync('ml/data/manifest.json'));
const offered=['Tadasana','Vrikshasana','Trikasana','Bhujasana'];
const frames=r=>JSON.parse(fs.readFileSync(`ml/data/${r.sha256}.json`)).frames;
const training=manifest.filter(r=>r.split==='train'&&offered.includes(r.pose)&&r.useForTraining===true).map(r=>P.prepare(r,'ml/data',false));
function run(pose,source,reference,modern){
  const tracker=modern?new MovementCoach(pose,reference):new ContinuousPractice(pose,{motionRecognition:false});
  const speech=new LiveFeedback();
  let previous=null,switches=0,completion=null;const active=new Set(),spoken=new Set();
  for(const f of source){
    const a=Object.fromEntries(FEATURES.map((k,i)=>[k,f.angles[i]]));
    const r=tracker.update(a,f.t);
    if(previous!==null&&previous!==r.phase)switches++;
    previous=r.phase;
    if(modern)for(const e of r.coaching.active)active.add(e.id);
    const message=speech.update(r,f.t);if(message&&r.status==='adjust')spoken.add(message);
    if(r.status==='complete'){completion=r.summary;break;}
  }
  return {complete:!!completion,verdict:completion?.verdict??'not completed',summaryCorrections:completion?.corrections.length??null,
    phaseSwitches:switches,uniqueSpokenCorrections:spoken.size,classifiedErrors:[...active]};
}
const rows=[];
for(const clip of training){
  const others=training.filter(c=>c.record.pose===clip.record.pose&&c!==clip);
  const pose=P.train(others),ref=pose.name==='Tadasana'?fitRelationship(others):undefined;
  const source=frames(clip.record);
  rows.push({split:'development',path:clip.record.path,baseline:run(pose,source,ref,false),updated:run(pose,source,ref,true)});
}
for(const record of manifest.filter(r=>r.split==='test'&&offered.includes(r.pose))){
  const pose=model.poses.find(p=>p.name===record.pose),ref=relationships.poses[pose.name],source=frames(record);
  rows.push({split:'test',path:record.path,baseline:run(pose,source,ref,false),updated:run(pose,source,ref,true)});
}
const totals={};
for(const split of ['development','test'])for(const kind of ['baseline','updated']){
  const selected=rows.filter(r=>r.split===split).map(r=>r[kind]);
  totals[`${split}/${kind}`]={recordings:selected.length,complete:selected.filter(r=>r.complete).length,
    judgedCorrect:selected.filter(r=>r.verdict==='correct').length,
    completedWithSummaryCorrections:selected.filter(r=>r.complete&&r.summaryCorrections>0).length,
    withLiveCorrections:selected.filter(r=>r.uniqueSpokenCorrections>0).length,
    phaseSwitches:selected.reduce((n,r)=>n+r.phaseSwitches,0)};
}
const report={protocol:'Full recordings; nested leave-one-training-video-out. Fixed test references, no test calibration. Old angle caches lack world geometry: new arm asymmetry is an angle-only proxy here. Live device requires wrist corroboration.',
  limitations:['No labeled incorrect recordings: real mistake accuracy and body-side accuracy are unknown.',
    'Existing test recordings were inspected during earlier development; not a pristine benchmark.',
    'Speech metrics use the current deduplicating controller for both algorithms; no device speech timing simulated.'],totals,rows};
fs.writeFileSync('ml/reports/coaching-evaluation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(totals,null,2));
