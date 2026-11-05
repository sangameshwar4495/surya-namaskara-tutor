const {spawnSync}=require('node:child_process');
const python=process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python';
const result=spawnSync(python,['ml/export_references.py'],{stdio:'inherit'});
if(result.error) console.error(result.error);
process.exitCode=result.status??1;
