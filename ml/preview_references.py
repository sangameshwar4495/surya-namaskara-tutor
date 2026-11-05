"""Render representative exported skeletons for visual QA, without source video pixels."""
import json
from pathlib import Path
import cv2
import numpy as np

library=json.loads(Path('src/data/temporalReferences.json').read_text())
canvas=np.full((len(library['poses'])*360,1000,3),248,dtype=np.uint8)
edges=[(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28),(27,31),(28,32)]
for row,pose in enumerate(library['poses']):
    for col,phase in enumerate([round(i*(len(pose['phases'])-1)/3) for i in range(4)]):
        points=pose['phases'][phase]['landmarks']
        ox,oy=col*250,row*360
        cv2.putText(canvas,f'{pose["name"]} / {phase+1}',(ox+8,oy+22),cv2.FONT_HERSHEY_SIMPLEX,.45,(35,55,40),1)
        def xy(i):
            return (int(ox+12+(1-points[i]['x'])*225),int(oy+38+points[i]['y']*300))
        for a,b in edges:
            if min(points[a]['visibility'],points[b]['visibility'])>=.6:
                cv2.line(canvas,xy(a),xy(b),(210,145,60),3,cv2.LINE_AA)
        for i,p in enumerate(points):
            if (i==0 or i>=11) and p['visibility']>=.6:
                cv2.circle(canvas,xy(i),3,(210,145,60),-1,cv2.LINE_AA)
Path('ml/reports').mkdir(exist_ok=True)
cv2.imwrite('ml/reports/reference-preview.png',canvas)
