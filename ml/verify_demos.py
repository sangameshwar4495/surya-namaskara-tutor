"""Decode bundled clips, check mobile codec/audio and make a visual QA contact sheet."""
import json
from pathlib import Path
import subprocess
import cv2
import imageio_ffmpeg
import numpy as np

videos=sorted(Path('assets/demos').glob('*.mp4'))
assert len(videos)==5, 'Expected one demonstration per dataset pose'
canvas=np.full((len(videos)*230,900,3),245,dtype=np.uint8)
report=[]
for row,path in enumerate(videos):
    result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-i',str(path)],capture_output=True,text=True)
    assert 'Video: h264' in result.stderr, f'Not H.264: {path}'
    assert 'Audio:' not in result.stderr, f'Unintended audio: {path}'
    cap=cv2.VideoCapture(str(path))
    frames=cap.get(cv2.CAP_PROP_FRAME_COUNT);fps=cap.get(cv2.CAP_PROP_FPS)
    assert frames>0 and fps>0
    for col,fraction in enumerate([.03,.5,.93]):
        cap.set(cv2.CAP_PROP_POS_FRAMES,int(frames*fraction));ok,frame=cap.read()
        assert ok, f'Cannot decode {path} at {fraction}'
        h,w=frame.shape[:2];scale=min(290/w,200/h);frame=cv2.resize(frame,(round(w*scale),round(h*scale)))
        h,w=frame.shape[:2];x=col*300+(300-w)//2;y=row*230+25
        canvas[y:y+h,x:x+w]=frame
        cv2.putText(canvas,f'{path.stem} {frames/fps*fraction:.1f}s',(col*300+6,row*230+18),cv2.FONT_HERSHEY_SIMPLEX,.45,(30,40,30),1)
    cap.release()
    report.append({'file':str(path),'durationSeconds':round(frames/fps,2),'bytes':path.stat().st_size,'codec':'H.264','audio':False})
Path('ml/reports/demo-verification.json').write_text(json.dumps(report,indent=2))
cv2.imwrite('ml/reports/demo-preview.jpg',canvas)
print(json.dumps(report,indent=2))
