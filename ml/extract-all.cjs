const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const python=process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python';
const index=spawnSync(process.execPath,['ml/index-dataset.cjs'],{stdio:'inherit'});
if(index.status!==0)process.exit(index.status??1);
fs.mkdirSync('ml/reports',{recursive:true});
const groups=[['Bhujasana','Padamasana'],['Tadasana','Trikasana'],['Vrikshasana']];
Promise.all(groups.map((poses,i)=>new Promise((resolve,reject)=>{
  const log=fs.openSync(`ml/reports/extract-${i+1}.log`,'w');
  const child=spawn(path.resolve(python),['ml/extract.py','--cache-only','--poses',...poses],{stdio:['ignore',log,log]});
  fs.closeSync(log);
  console.log(`Extracting ${poses.join(', ')}; progress: ml/reports/extract-${i+1}.log`);
  child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(Error(`Extraction group ${i+1} exited ${code}; inspect its log`)));
}))).then(()=>console.log('All feature caches ready.')).catch(e=>{console.error(e);process.exitCode=1;});
