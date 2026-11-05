// Offline review utility: no server, upload, or automatic correctness labels.
const fs=require('node:fs');
const records=JSON.parse(fs.readFileSync('ml/data/manifest.json','utf8'));
const report=fs.existsSync('ml/reports/evaluation.json')?JSON.parse(fs.readFileSync('ml/reports/evaluation.json')):{};
const proposals=[...(report.trainingSegments??[]),...(report.evaluation??[]).map(r=>({path:r.path,...r.boundaries}))];
for(const record of records) record.proposal=proposals.find(p=>p.path===record.path)??null;
fs.mkdirSync('ml/reports',{recursive:true});
const embedded=JSON.stringify(records).replaceAll('<','\\u003c');
fs.writeFileSync('ml/reports/review.html',`<!doctype html><meta charset="utf-8">
<title>Review movement recordings</title>
<style>body{font:17px system-ui;max-width:1000px;margin:30px auto;background:#f7f5ee;color:#172923}video{width:100%;max-height:520px;background:black}button,input,select{font:inherit;padding:8px;margin:6px}label{display:inline-block}p{line-height:1.5}</style>
<h1>Review movement recordings</h1>
<p>Watch the entire recording. Mark one complete entry and final hold, excluding release. Only a knowledgeable reviewer should label correctness. Download the edited manifest and replace ml/data/manifest.json before training.</p>
<select id="clip"></select><video id="video" controls></video>
<p id="time"></p><div id="fields"></div>
<p id="proposal"></p><button id="useProposal">Use proposed boundaries (review video first)</button>
<label>Correctness <select id="correct"><option value="">Unreviewed</option><option value="true">Correct reference</option><option value="false">Incorrect performance</option></select></label>
<label>Performer ID <input id="subject"></label>
<p><button id="previous">Previous</button><button id="next">Next</button><button id="download">Download manifest</button></p>
<script>
const rows=${embedded};let index=0;
const clip=document.getElementById('clip'), video=document.getElementById('video');
const correct=document.getElementById('correct'), subject=document.getElementById('subject');
const keys=['startMs','finalMs','endMs'];
for(const key of keys){const label=document.createElement('label');label.textContent=key+' ';const input=document.createElement('input');input.type='number';input.min=0;input.id=key;input.style.width='110px';label.append(input);const button=document.createElement('button');button.textContent='Use current time';button.onclick=()=>{input.value=Math.round(video.currentTime*1000);save();};label.append(button);document.getElementById('fields').append(label);input.onchange=save;}
rows.forEach((r,i)=>{const option=document.createElement('option');option.value=i;option.textContent=r.path;clip.append(option);});
function save(){const r=rows[index];for(const key of keys){const value=document.getElementById(key).value;r[key]=value===''?null:Number(value);}r.correct=correct.value===''?null:correct.value==='true';r.subject=subject.value.trim()||null;}
function load(i){index=i;clip.value=i;const r=rows[i];video.src='../../dataset/'+r.path.split('/').map(encodeURIComponent).join('/');for(const key of keys)document.getElementById(key).value=r[key]??'';correct.value=r.correct===null?'':String(r.correct);subject.value=r.subject??'';document.getElementById('proposal').textContent=r.proposal?'Unreviewed proposal: '+keys.map(k=>k+' '+r.proposal[k]).join(', '):'No automatic proposal available.';document.getElementById('useProposal').disabled=!r.proposal;}
document.getElementById('useProposal').onclick=()=>{for(const key of keys)document.getElementById(key).value=rows[index].proposal[key];save();};
clip.onchange=()=>{save();load(Number(clip.value));};correct.onchange=save;subject.onchange=save;
video.ontimeupdate=()=>document.getElementById('time').textContent=Math.round(video.currentTime*1000)+' ms';
document.getElementById('previous').onclick=()=>{save();load(Math.max(0,index-1));};
document.getElementById('next').onclick=()=>{save();load(Math.min(rows.length-1,index+1));};
document.getElementById('download').onclick=()=>{save();const a=document.createElement('a');const clean=rows.map(({proposal,...r})=>r);const url=URL.createObjectURL(new Blob([JSON.stringify(clean,null,2)],{type:'application/json'}));a.href=url;a.download='manifest.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
load(0);
</script>`);
console.log('Open ml/reports/review.html; annotations are saved only when you download the manifest.');
