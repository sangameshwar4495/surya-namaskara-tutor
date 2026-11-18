// Supplemental interpretable relationship, trained exclusively on included training recordings.
// Core DTW schema/key remains unchanged, so existing reference clips remain compatible.
const fs=require('node:fs');
const P=require('./pipeline.cjs');
const quantile=(a,q)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(q*a.length))];
function fitRelationship(clips){
  const maxima=clips.map(c=>c.entry.flatMap(f=>f.angles[4]!==null&&f.angles[5]!==null?[Math.abs(f.angles[4]-f.angles[5])]:[])).filter(v=>v.length>=12).map(v=>quantile(v,.99));
  if(maxima.length<4)return undefined;
  // Leave-one-video-out upper-envelope residual. No test recordings are loaded here.
  const margins=maxima.map((v,i)=>Math.max(0,v-Math.max(...maxima.filter((_,j)=>i!==j))));
  return {shoulderDifference:Math.max(20,Math.max(...maxima)+Math.max(5,...margins)),trainingVideos:maxima.length,variant:'arms-overhead'};
}
if(require.main===module){
  const model=JSON.parse(fs.readFileSync('src/data/temporalModel.json'));
  const manifest=JSON.parse(fs.readFileSync('ml/data/manifest.json'));
  const clips=manifest.filter(r=>r.split==='train'&&r.pose==='Tadasana'&&r.useForTraining===true&&r.correct===true).map(r=>P.prepare(r,'ml/data',false));
  const reference=fitRelationship(clips);
  if(!reference)throw Error('Need at least four reviewed, bilaterally visible recordings');
  const artifact={version:1,modelKey:model.referenceKey,featureSchema:'bilateral-shoulder-difference-v1',poses:{Tadasana:reference},
    provenance:{trainingHashes:clips.map(c=>c.record.sha256),method:'Per-video q99 bilateral shoulder difference plus leave-one-video-out envelope residual; floor 20 degrees, margin floor 5 degrees. Not probability-calibrated.'}};
  fs.writeFileSync('src/data/relationshipModel.json',JSON.stringify(artifact,null,2)+'\n');
  console.log(JSON.stringify(artifact,null,2));
}
module.exports={fitRelationship};
