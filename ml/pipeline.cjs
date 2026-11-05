const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { FEATURES, FINAL_HOLD_MS, hasSide, mirrorFeatures, phaseError, validateModel } = require('../src/services/temporalPose.ts');
const { ContinuousPractice } = require('../src/services/continuousPractice.ts');
const SEQUENCE = ['Tadasana', 'Vrikshasana', 'Trikasana', 'Bhujasana', 'Padamasana'];
const median = a => {const finite=a.filter(v=>typeof v==='number' && Number.isFinite(v));return finite.length?quantile(finite,.5):null;};
function quantile(a, q) { const s = [...a].sort((x,y) => x-y); return s[Math.min(s.length-1, Math.floor(q*s.length))]; }
const valid = f => f.angles.length === 8 && hasSide(f.angles);
function distance(a,b) {
  const common=a.map((v,i)=>v!==null && b[i]!==null?v:null);
  if(!hasSide(common))return 180**2;
  const diffs=common.flatMap((v,i)=>v===null?[]:[(v-b[i])**2]);
  return diffs.reduce((s,v)=>s+v,0)/diffs.length;
}
// Weak segmentation only: stable plateau after a visibly changing movement.
// These proposals are never promoted to reviewed correctness labels.
function propose(frames) {
  const usable=frames.filter(valid);
  if(usable.length<24)throw Error('Too few visible-side frames to propose a movement');
  const holds=[];
  for(let i=0;i<usable.length;i++) {
    const window=usable.filter(f=>f.t>=usable[i].t && f.t<=usable[i].t+2000);
    if(window.length<12 || window.at(-1).t-window[0].t<1700)continue;
    const center=FEATURES.map((_,k)=>median(window.map(f=>f.angles[k])));
    if(quantile(window.map(f=>distance(f.angles,center)),.8)<12**2)holds.push({start:window[0].t,end:window.at(-1).t,center});
  }
  for(const hold of holds) {
    // Find a distinct posture 0.75–12 seconds before a steady endpoint.
    const candidates=usable.filter(f=>f.t<hold.start-750 && f.t>=hold.start-12000);
    const distinct=candidates.filter(f=>distance(f.angles,hold.center)>18**2 && distance(f.angles,hold.center)<180**2);
    if(distinct.length<6)continue;
    const start=distinct[0].t;
    const interval=frames.filter(f=>f.t>=start && f.t<=hold.end);
    const observed=interval.filter(valid);
    if(hold.start-start>=1500 && observed.length>=24 && observed.length/interval.length>=.6 &&
       observed.filter(f=>f.t<hold.start).length>=12 &&
       !observed.some((f,i)=>i && f.t-observed[i-1].t>1000))return {start,final:hold.start,end:hold.end};
  }
  throw Error('No distinct entry followed by a stable hold found; annotate boundaries');
}

function prepare(record, data, draft) {
  const frames = JSON.parse(fs.readFileSync(path.join(data, `${record.sha256}.json`))).frames;
  const annotated = [record.startMs, record.finalMs, record.endMs].every(v=>typeof v==='number' && Number.isFinite(v));
  if (!draft && (!annotated || typeof record.correct !== 'boolean')) throw Error(`Review correctness and movement boundaries: ${record.path}`);
  const {start,final,end}=annotated?{start:record.startMs,final:record.finalMs,end:record.endMs}:propose(frames);
  if (!(start >= frames[0].t && start < final && final < end && end <= frames.at(-1).t)) throw Error(`Invalid boundaries: ${record.path}`);
  const selected = frames.filter(f => f.t >= start && f.t <= end);
  const usable = selected.filter(valid);
  if (usable.length < 24 || usable.length/selected.length < .6) throw Error(`Insufficient tracking coverage: ${record.path}`);
  if (usable.some((f,i) => i && f.t-usable[i-1].t > 1000)) throw Error(`Tracking gap exceeds 1 second: ${record.path}`);
  const entry = usable.filter(f => f.t < final), hold = usable.filter(f => f.t >= final);
  if (entry.length < 12 || hold.length < 4) throw Error(`Too few entry/hold frames: ${record.path}`);
  return { record, frames: selected, entry, hold, annotated, boundaries:{startMs:start,finalMs:final,endMs:end} };
}

// Dynamic time warping aligns demonstrations with different movement speeds.
function align(reference, sample) {
  return alignGroups(reference, sample).map(g => FEATURES.map((_,k)=>median(g.map(v=>v[k]))));
}
/** DTW assignment of every sample frame to a reference index (frames kept, not summarized). */
function alignGroups(reference, sample) {
  const n = reference.length, m = sample.length;
  const d = Array.from({length:n+1}, () => Array(m+1).fill(Infinity)); d[0][0] = 0;
  const cost = distance;
  for(let i=1;i<=n;i++) for(let j=1;j<=m;j++) d[i][j] = cost(reference[i-1],sample[j-1])+Math.min(d[i-1][j],d[i][j-1],d[i-1][j-1]);
  const groups = Array.from({length:n},()=>[]);
  let i=n,j=m;
  while(i>0 && j>0) {
    groups[i-1].push(sample[j-1]);
    const best = Math.min(d[i-1][j-1],d[i-1][j],d[i][j-1]);
    if(d[i-1][j-1]===best) {i--;j--;} else if(d[i-1][j]===best) i--; else j--;
  }
  return groups;
}
const holdMedian=clip=>FEATURES.map((_,k)=>median(clip.hold.map(f=>f.angles[k])));
const mirrorFrames=frames=>frames.map(f=>({...f,angles:mirrorFeatures(f.angles)}));
const mirrorClip=clip=>({...clip,mirrored:!clip.mirrored,frames:clip.frames&&mirrorFrames(clip.frames),entry:mirrorFrames(clip.entry),hold:mirrorFrames(clip.hold)});
/**
 * Several asanas are demonstrated on either side (lifted leg, bend direction). Averaging both
 * variants produced bimodal joint statistics that matched neither, so clips are expressed in
 * one common orientation first. The anchor is the clip whose final pose is closest to all
 * others (allowing either orientation); each clip keeps its orientation unless the mirrored
 * one is strictly closer to the anchor. Profile-only recordings cannot flip (no common side).
 */
function orientClips(clips) {
  const holds=clips.map(holdMedian);
  const nearest=(a,b)=>Math.min(distance(a,b),distance(mirrorFeatures(a),b));
  const totals=holds.map(a=>holds.reduce((s,b)=>s+nearest(b,a),0));
  const anchor=holds[totals.indexOf(Math.min(...totals))];
  return clips.map((clip,i)=>distance(mirrorFeatures(holds[i]),anchor)<distance(holds[i],anchor)?mirrorClip(clip):clip);
}
/**
 * Among all windows spanning FINAL_HOLD_MS of consecutive observable hold frames (gaps <= 500 ms,
 * as at runtime), the one needing the smallest single-joint allowance. Returns that window's
 * worst normalized single-joint and RMS errors, or null when no such window exists.
 */
function bestHoldWindow(hold, phase) {
  const stats=hold.map(f=>({t:f.t,s:frameStatistics(f.angles,phase)}));
  let best=null;
  for(let i=0;i<stats.length;i++) {
    let max=0, rms=0;
    const joints=FEATURES.map(()=>null);
    for(let j=i;j<stats.length;j++) {
      if(!stats[j].s || (j>i && stats[j].t-stats[j-1].t>500))break;
      max=Math.max(max,stats[j].s.max);rms=Math.max(rms,stats[j].s.rms);
      stats[j].s.degrees.forEach((d,k)=>{if(d!==null)joints[k]=Math.max(joints[k]??0,d);});
      if(stats[j].t-stats[i].t>=FINAL_HOLD_MS){if(!best || max<best.max)best={max,rms,joints:[...joints]};break;}
    }
  }
  return best;
}
/** Per-frame statistics in the same form the runtime evaluator checks them. */
function frameStatistics(values, phase) {
  const e=phaseError(values,phase);
  if(!e.observable)return null;
  const degrees=FEATURES.map(k=>e.jointErrors.find(j=>j.joint===k)?.degrees??null);
  return {rms:e.normalizedError,max:Math.max(...e.jointErrors.map(j=>j.degrees/j.scale)),degrees};
}
function resample(frames, count) {
  return Array.from({length:count},(_,i)=> {
    const t=frames[0].t+(frames.at(-1).t-frames[0].t)*i/(count-1);
    return frames.reduce((a,b)=> Math.abs(a.t-t)<Math.abs(b.t-t)?a:b).angles;
  });
}
function fit(name, clips) {
  const samples = clips.map(c=>resample(c.entry,24));
  // Choose a real demonstration nearest to the other time-normalized examples.
  const costs=samples.map(a=>samples.reduce((s,b)=>s+a.reduce((v,row,i)=>v+distance(row,b[i]),0),0));
  const reference=samples[costs.indexOf(Math.min(...costs))];
  const aligned=samples.map(s=>align(reference,s));
  aligned.forEach((a,i)=>a.push(FEATURES.map((_,k)=>median(clips[i].hold.map(f=>f.angles[k])))));
  const phases=aligned[0].map((_,i)=> {
    const mean=FEATURES.map((_,k)=>{
      const observed=aligned.map(a=>a[i][k]).filter(v=>v!==null);
      return observed.length>=Math.ceil(clips.length/2)?median(observed):null;
    });
    const scale=FEATURES.map((_,k)=>Math.max(5,1.4826*(median(aligned.map(a=>a[i][k]!==null && mean[k]!==null?Math.abs(a[i][k]-mean[k]):null))??0)));
    return {mean,scale,threshold:1};
  });
  return {name,phases,trainingVideos:clips.length};
}
/**
 * `orient`: express all clips in one side orientation before fitting.
 * `frameCalibration`: calibrate on per-frame values with a separate per-joint multiplier,
 * matching what the runtime checks. The former calibration used the RMS of DTW-group/hold
 * medians and then reused that RMS threshold for every single joint, which is stricter than
 * anything it was calibrated on.
 * `jointAllowance`: final stage only — each joint gets its own held-out allowance in degrees.
 * The in-sample MAD spread sits at its 5-degree floor for most joints with 4-6 performers, so
 * one shared multiplier let the most person-variable joint widen every other joint.
 * REJECTED (off by default): with 3-5 inner performers each joint's allowance is the max of a
 * handful of values and held-out completion fell from 18/25 to 14/25 (ml/diagnose.cjs).
 * Switches exist for ablation reports.
 */
const TRAINING_DEFAULTS={orient:true,frameCalibration:true,jointAllowance:false};
function train(input, options={}) {
  const opts={...TRAINING_DEFAULTS,...options};
  const clips=opts.orient?orientClips(input):input;
  const pose=fit(clips[0].record.pose,clips);
  // Leave one VIDEO out to estimate tolerances. Test data never enters calibration.
  const rms=pose.phases.map(()=>[]), worst=pose.phases.map(()=>[]), contributors=pose.phases.map(()=>new Set());
  const finalAllowance=FEATURES.map(()=>[]);
  clips.forEach((clip,index)=> {
    const held=fit(pose.name,clips.filter((_,i)=>i!==index));
    const target=held.phases.at(-1).mean;
    // Score the held-out video in whichever orientation fits, exactly as the runtime may.
    const own=holdMedian(clip);
    const oriented=opts.orient && distance(mirrorFeatures(own),target)<distance(own,target)?mirrorClip(clip):clip;
    const reference=held.phases.slice(0,-1).map(p=>p.mean), sample=resample(oriented.entry,24);
    if(opts.frameCalibration) {
      // Intermediate stages only record per-frame errors at runtime: calibrate per frame.
      alignGroups(reference,sample).forEach((g,i)=>g.forEach(v=>{const s=frameStatistics(v,held.phases[i]);
        if(s){rms[i].push(s.rms);worst[i].push(s.max);contributors[i].add(index);}}));
      // The final stage decision is "is there one continuous FINAL_HOLD_MS run within
      // tolerance?", so calibrate the smallest allowance that gives this video such a run.
      const last=held.phases.length-1, run=bestHoldWindow(oriented.hold,held.phases[last]);
      if(run){rms[last].push(run.rms);worst[last].push(run.max);contributors[last].add(index);
        run.joints.forEach((d,k)=>{if(d!==null)finalAllowance[k].push(d);});}
    } else {
      const aligned=align(reference,sample);
      aligned.push(holdMedian(oriented));
      aligned.forEach((v,i)=>{const e=phaseError(v,held.phases[i]);if(e.observable){rms[i].push(e.normalizedError);contributors[i].add(index);}});
    }
  });
  pose.phases.forEach((p,i)=>{
    if(contributors[i].size<2)throw Error(`Insufficient calibration coverage: ${pose.name} checkpoint ${i+1}`);
    p.threshold=Math.max(1.5,Math.min(3,quantile(rms[i],.9)));
    // No new upper clamp: jointTolerance() still caps every joint at 20 degrees.
    if(opts.frameCalibration)p.jointThreshold=Math.max(p.threshold,quantile(worst[i],.9));
  });
  if(opts.frameCalibration && opts.jointAllowance) {
    const final=pose.phases.at(-1);
    // Joints seen in fewer than two held-out videos keep the shared-multiplier allowance.
    final.tolerance=FEATURES.map((_,k)=>finalAllowance[k].length>=2?quantile(finalAllowance[k],.9):final.scale[k]*final.jointThreshold);
  }
  const selected=selectStages(pose.phases);
  return {...pose,phases:selected.map(i=>pose.phases[i]),
    orientation:opts.orient?{method:'left/right canonicalization to a medoid final pose',mirroredTrainingClips:clips.filter(c=>c.mirrored).length}:undefined,
    calibration:opts.frameCalibration?'leave-one-video-out: intermediate stages per-frame q90; final stage q90 over videos of the smallest allowance giving a 1.5 s hold'+(opts.jointAllowance?', per joint in degrees':''):'leave-one-video-out RMS of medians (q90)',
    stageSelection:{method:'trajectory simplification using learned spread',denseCount:pose.phases.length,selectedIndices:selected}};
}
const framesToAngles=f=>Object.fromEntries(FEATURES.map((k,i)=>[k,f.angles[i]]));
/** Run a whole recording through the same evaluator the camera screen uses. */
function simulate(pose, frames, practiceOptions={}) {
  const tracker=new ContinuousPractice(pose,practiceOptions);
  const outputs=[];
  for(const f of frames) {
    const o=tracker.update(framesToAngles(f),f.t);
    outputs.push({...o,t:f.t});
    if(o.status==='complete')break;
  }
  const completed=outputs.find(o=>o.status==='complete');
  return {outputs,completed,completedAtMs:completed?.t??null};
}
const coverage=frames=>frames.filter(valid).length/frames.length;
/**
 * Development metric on TRAINING data only: for each training video, fit on the other
 * training videos of that pose (thresholds calibrated by their own inner leave-one-out),
 * then run the held-out FULL recording through the runtime evaluator.
 */
function leaveOneVideoOut(training, fullFrames, {trainOptions={},practiceOptions={}}={}) {
  const rows=[];
  for(const name of SEQUENCE) {
    const group=training.filter(c=>c.record.pose===name);
    group.forEach((clip,i)=>{
      const pose=train(group.filter((_,j)=>j!==i),trainOptions);
      const run=simulate(pose,fullFrames(clip.record),practiceOptions);
      rows.push({pose:name,path:clip.record.path,complete:!!run.completed,verified:run.completed?.summary?.verified??false,completedAtMs:run.completedAtMs,
        corrections:run.completed?.summary?.corrections.length??null});
    });
  }
  return rows;
}
/** Crude false-acceptance proxy: a pose model should not complete on another asana's video. */
function crossPose(models, records, fullFrames, practiceOptions={}) {
  const rows=[];
  for(const pose of models) for(const record of records.filter(r=>r.pose!==pose.name)) {
    const run=simulate(pose,fullFrames(record),practiceOptions);
    rows.push({model:pose.name,path:record.path,complete:!!run.completed,completedAtMs:run.completedAtMs});
  }
  return rows;
}
function tally(rows, key='pose') {
  const out={};
  for(const r of rows){const k=r[key];out[k]??={n:0,complete:0,verified:0,withCorrections:0};out[k].n++;out[k].complete+=r.complete?1:0;out[k].verified+=r.verified?1:0;
    // Every recording is an intended-correct demonstration: any spoken correction is a false alarm.
    const n=r.corrections??r.summary?.corrections?.length??0;out[k].withCorrections+=r.complete&&n>0?1:0;}
  return out;
}
function selectStages(phases) {
  const keep=new Set([0,phases.length-1]);
  const epsilon=Math.max(6,Math.min(12,median(phases.flatMap(p=>p.scale))));
  function split(a,b) {
    let worst=-1,index=-1;
    for(let i=a+1;i<b;i++) {
      const alpha=(i-a)/(b-a);
      const predicted=phases[a].mean.map((v,k)=>v===null||phases[b].mean[k]===null?null:v+(phases[b].mean[k]-v)*alpha);
      const error=Math.sqrt(distance(predicted,phases[i].mean));
      if(error>worst){worst=error;index=i;}
    }
    if(index>=0 && worst>epsilon){keep.add(index);split(a,index);split(index,b);}
  }
  split(0,phases.length-1);
  if(keep.size<3)keep.add(Math.floor((phases.length-1)/2));
  return [...keep].sort((a,b)=>a-b);
}
function run(argv=process.argv.slice(2)) {
  const draft=argv.includes('--draft');
  const data=path.resolve('ml/data');
  const manifest=JSON.parse(fs.readFileSync(path.join(data,'manifest.json')));
  const policy=fs.existsSync('ml/dataset-policy.json')?JSON.parse(fs.readFileSync('ml/dataset-policy.json')):{};
  const hashes=new Map();
  let extractionSignature=null;
  for(const r of manifest) {
    if (!['train','test'].includes(r.split) || !SEQUENCE.includes(r.pose)) throw Error(`Unknown split/pose: ${r.path}`);
    if(hashes.has(r.sha256)) throw Error(`Duplicate video: ${r.path} and ${hashes.get(r.sha256)}`);
    hashes.set(r.sha256,r.path);
    const cacheFile=path.join(data,`${r.sha256}.json`);
    if(!fs.existsSync(cacheFile))throw Error(`Missing feature cache: ${r.path}; finish npm run ml:extract first`);
    const cache=JSON.parse(fs.readFileSync(cacheFile));
    if(cache.version!==1 || !cache.modelHash || cache.sampleFps!==8)throw Error(`Incompatible feature cache: ${r.path}; re-extract at 8 fps`);
    const signature=`${cache.modelHash}/${cache.sampleFps}`;
    if(extractionSignature!==null && signature!==extractionSignature)throw Error('Mixed landmark extraction models/settings');
    extractionSignature=signature;
  }
  const trainSubjects=new Set(manifest.filter(r=>r.split==='train' && r.subject).map(r=>r.subject));
  if(manifest.some(r=>r.split==='test' && r.subject && trainSubjects.has(r.subject))) throw Error('Subject leakage across train/test');
  const rejected=[];
  const load=r=> {try {return prepare(r,data,draft);} catch(e) {rejected.push({path:r.path,reason:e.message}); return null;}};
  for(const r of manifest.filter(r=>r.split==='train' && r.useForTraining===false))rejected.push({path:r.path,reason:r.note??'Excluded during source review'});
  const training=manifest.filter(r=>r.split==='train' && r.useForTraining!==false && (draft ? r.correct!==false : r.correct===true)).map(load).filter(Boolean);
  const model={version:1,reviewed:!draft,features:[...FEATURES],sequence:SEQUENCE,poses:[],
    provenance:{method:'DTW-aligned robust checkpoints; leave-one-video-out thresholds',extractionSignature,
      trainingHashes:training.map(c=>c.record.sha256)}};
  for(const name of SEQUENCE) {
    const clips=training.filter(c=>c.record.pose===name);
    if(clips.length<4) throw Error(`${name}: need at least 4 usable ${draft?'':'reviewed '}training videos. ${JSON.stringify(rejected)}`);
    model.poses.push(train(clips));
  }
  validateModel(model);
  model.referenceKey=require('node:crypto').createHash('sha256').update(JSON.stringify(model.poses)).digest('hex');
  const fullFrames=r=>JSON.parse(fs.readFileSync(path.join(data,`${r.sha256}.json`))).frames;
  // Development evidence comes from training videos only (nested leave-one-video-out).
  const development=argv.includes('--skip-development')?[]:leaveOneVideoOut(training,fullFrames);
  const developmentCrossPose=argv.includes('--skip-development')?[]:crossPose(model.poses,manifest.filter(r=>r.split==='train'),fullFrames);
  // Test protocol mirrors the app: the whole recording is streamed, with no boundaries.
  // Earlier revisions evaluated only an automatically proposed ~2 s "hold" window, which
  // usually preceded the actual final pose and could not contain a 1.5 s hold.
  const testRecords=manifest.filter(r=>r.split==='test');
  const evaluation=testRecords.map(record=>{
    const frames=fullFrames(record);
    const pose=model.poses.find(p=>p.name===record.pose);
    const {outputs,completed}=simulate(pose,frames);
    const scored=outputs.filter(o=>o.errorDegrees!==null);
    const trackingCoverage=coverage(frames);
    return {path:record.path,pose:record.pose,protocol:'full recording',correctLabel:record.correct,
      // Same 60% complete-side coverage rule used to accept training segments.
      scorable:trackingCoverage>=.6,trackingCoverage,complete:!!completed,verified:completed?.summary?.verified??false,
      completedAtMs:completed?.t??null,durationMs:frames.at(-1).t,summary:completed?.summary??null,
      maxCheckpoint:Math.max(...outputs.map(o=>o.phase))+1,totalCheckpoints:pose.phases.length,
      mirroredFraction:scored.length?scored.filter(o=>o.mirrored).length/scored.length:0,
      intermediateMeanErrorDegrees:average(scored.filter(o=>o.phase<pose.phases.length-1).map(o=>o.errorDegrees)),
      finalMeanErrorDegrees:average(scored.filter(o=>o.phase===pose.phases.length-1).map(o=>o.errorDegrees)),
      frames:outputs.map(o=>({t:o.t,phase:o.phase,status:o.status,heldMs:o.heldMs,errorDegrees:o.errorDegrees,mirrored:o.mirrored??false,
        outside:o.jointErrors.filter(e=>e.outsideTolerance).map(e=>({joint:e.joint,signedDegrees:e.signedDegrees,tolerance:e.tolerance}))}))};
  });
  const testCrossPose=crossPose(model.poses,testRecords,fullFrames);
  const report={draft,subjectIndependenceDeclared:policy.trainTestPerformersDisjoint===true,
    subjectIndependenceVerified:manifest.every(r=>!!r.subject),trainingVideos:training.length,
    trainingSegments:training.map(c=>({path:c.record.path,...c.boundaries,boundariesReviewed:c.annotated})),
    testVideos:evaluation.length,rejected,notes:['Completion is reference matching, not correctness accuracy.',
      'Without labeled incorrect performances, false acceptance and error-detection accuracy cannot be estimated.',
      'Cross-pose completion is only a proxy for false acceptance: other asanas are not deliberate mistakes.',
      'Draft boundaries are automatically proposed from movement followed by a stable plateau; review before deployment.'],
    development:{protocol:'nested leave-one-training-video-out, full recordings',byPose:tally(development),rows:development,
      crossPose:{trials:developmentCrossPose.length,completions:developmentCrossPose.filter(r=>r.complete).length,rows:developmentCrossPose.filter(r=>r.complete)}},
    test:{protocol:'full recording',byPose:tally(evaluation),scorableByPose:tally(evaluation.filter(r=>r.scorable)),
      crossPose:{trials:testCrossPose.length,completions:testCrossPose.filter(r=>r.complete).length,rows:testCrossPose.filter(r=>r.complete)}},
    evaluation};
  model.validation={protocol:'full recording',evaluated:evaluation.length,scorable:evaluation.filter(r=>r.scorable).length,
    completed:evaluation.filter(r=>r.complete).length,verified:evaluation.filter(r=>r.verified).length,
    unscorable:evaluation.filter(r=>!r.scorable).length,
    crossPoseCompletions:testCrossPose.filter(r=>r.complete).length,crossPoseTrials:testCrossPose.length,
    developmentCompleted:development.filter(r=>r.complete).length,developmentVideos:development.length,productionReady:false};
  fs.mkdirSync('ml/reports',{recursive:true});
  fs.writeFileSync('ml/reports/evaluation.json',JSON.stringify(report,null,2));
  const summary={...report,evaluation:evaluation.map(({frames,...r})=>r)};
  fs.writeFileSync('ml/reports/summary.json',JSON.stringify(summary,null,2));
  fs.writeFileSync('src/data/temporalModel.json.tmp',JSON.stringify(model,null,2));
  fs.renameSync('src/data/temporalModel.json.tmp','src/data/temporalModel.json');
  console.log(JSON.stringify(summary,null,2));
}
function average(a) {return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;}
module.exports={align,alignGroups,fit,train,prepare,selectStages,orientClips,simulate,leaveOneVideoOut,crossPose,tally,coverage,run,SEQUENCE};
if(require.main===module) run();
