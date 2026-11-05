// Timing annotations from visual review; correctness labels remain owner supplied.
const fs=require('node:fs');
const manifest=JSON.parse(fs.readFileSync('ml/data/manifest.json'));
if(process.argv.includes('--record')) {
  const reviewed={
    Tadasana:{1:[2000,5000,16000],11:[0,2000,16000],12:[1000,3000,16000],3:[0,3000,16000],5:[0,2000,16000],9:[0,2000,16000]},
    Vrikshasana:{1:[0,5000,20000],2:[0,3000,20000],5:[0,5000,20000],8:[0,3000,20000]},
    Bhujasana:{1:[2000,5000,12000],11:[5000,8000,16000],12:[1000,5000,16000],2:[5000,12000,20000],3:[2000,5000,16000],4:[2000,5000,16000]},
    Trikasana:{1:[0,2000,8000],10:[0,2000,16000],2:[1000,4000,12000],4:[0,2000,8000],5:[0,2000,8000]},
  };
  const annotations=manifest.filter(r=>r.split==='train' && reviewed[r.pose]).map(r=>{
    const number=Number(r.path.match(/video (\d+)/)[1]);
    const timing=reviewed[r.pose][number];
    return {path:r.path,sha256:r.sha256,useForTraining:!!timing,
      ...(timing?{startMs:timing[0],finalMs:timing[1],endMs:timing[2]}:{}),
      note:timing?'Entry and attained hold selected from timestamped source contact sheets; timings are approximate.'
        :'Not selected for this reference revision: complete entry, movement side or repetition needs review.'};
  });
  fs.writeFileSync('ml/reviewed-boundaries.json',JSON.stringify(annotations,null,2));
}
const annotations=JSON.parse(fs.readFileSync('ml/reviewed-boundaries.json'));
for(const annotation of annotations){
  const row=manifest.find(r=>r.path===annotation.path);
  if(!row || row.sha256!==annotation.sha256)throw Error(`Source changed: ${annotation.path}`);
  Object.assign(row,annotation);
}
fs.writeFileSync('ml/data/manifest.json',JSON.stringify(manifest,null,2));
console.log(`Applied ${annotations.length} hash-checked source review decisions.`);
