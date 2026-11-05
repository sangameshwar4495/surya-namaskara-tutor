const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
async function main() {
  fs.mkdirSync('ml/data',{recursive:true});
  const target='ml/data/manifest.json';
  const old=fs.existsSync(target)?JSON.parse(fs.readFileSync(target)):[];
  const policy=JSON.parse(fs.readFileSync('ml/dataset-policy.json'));
  const rows=[];
  for(const split of ['train','test']) {
    for(const pose of fs.readdirSync(`dataset/${split}`,{withFileTypes:true}).filter(d=>d.isDirectory())) {
      for(const name of fs.readdirSync(`dataset/${split}/${pose.name}`).filter(n=>/\.(mp4|mov|avi|mkv)$/i.test(n)).sort()) {
        const relative=`${split}/${pose.name}/${name}`;
        const hash=crypto.createHash('sha256');
        for await(const chunk of fs.createReadStream(path.join('dataset',relative))) hash.update(chunk);
        const sha256=hash.digest('hex');
        const previous=old.find(r=>r.path===relative && r.sha256===sha256);
        const row=previous??{path:relative,split,pose:pose.name,sha256,subject:null,correct:null,startMs:null,finalMs:null,endMs:null};
        if(row.correct===null && policy.allVideosIntendedCorrect)row.correct=true;
        rows.push(row);
      }
    }
  }
  fs.writeFileSync(target,JSON.stringify(rows,null,2));
  const counts={};for(const row of rows)counts[`${row.split}/${row.pose}`]=(counts[`${row.split}/${row.pose}`]??0)+1;
  console.log(JSON.stringify({videos:rows.length,counts,duplicateHashes:rows.length-new Set(rows.map(r=>r.sha256)).size},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
