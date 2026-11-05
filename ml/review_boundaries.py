"""Timestamped contact sheets for manual entry/hold boundary review."""
from pathlib import Path
import cv2
import numpy as np
import argparse

chosen={'Tadasana':[1,11,12,3,5,9], 'Vrikshasana':[1,10,11,2,3,6],
        'Trikasana':[1,10,2,3,4,5], 'Bhujasana':[1,11,12,2,3,4], 'Padamasana':[1,10,2,7,9,11]}
times=[0,1,2,3,5,8,12,16,20]
parser=argparse.ArgumentParser()
parser.add_argument('--pose')
parser.add_argument('--late',action='store_true')
args=parser.parse_args()
if args.late:
    times=[20,25,30,35,40,45,50,55,60]
if args.pose=='Vrikshasana':
    chosen['Vrikshasana']=[1,2,4,5,7,8,9]
for pose, numbers in chosen.items():
    if args.pose and pose!=args.pose:
        continue
    videos=[Path(f'dataset/train/{pose}/video {n}.mp4') for n in numbers]+sorted(Path(f'dataset/test/{pose}').glob('*.mp4'))
    sheet=np.full((len(videos)*140,len(times)*180,3),245,dtype=np.uint8)
    for row,path in enumerate(videos):
        cap=cv2.VideoCapture(str(path))
        cv2.putText(sheet,f'{path.parent.parent.name}/{path.name}',(8,row*140+16),cv2.FONT_HERSHEY_SIMPLEX,.46,(20,20,20),1)
        for col,t in enumerate(times):
            cap.set(cv2.CAP_PROP_POS_MSEC,t*1000)
            ok,frame=cap.read()
            if ok:
                h,w=frame.shape[:2];res=cv2.resize(frame,(180,round(h*180/w)))
                sheet[row*140+22:row*140+22+res.shape[0],col*180:(col+1)*180]=res
            cv2.putText(sheet,f'{t}s',(col*180+8,row*140+136),cv2.FONT_HERSHEY_SIMPLEX,.4,(20,20,20),1)
        cap.release()
    suffix='-late' if args.late else ''
    cv2.imwrite(f'ml/reports/boundaries-{pose}{suffix}.jpg',sheet)
