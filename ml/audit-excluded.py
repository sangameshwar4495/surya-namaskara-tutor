"""Review aids only: never promotes a recording or changes source annotations."""
import json
from pathlib import Path
import cv2
import numpy as np

root = Path('ml/reports/excluded-review')
root.mkdir(parents=True, exist_ok=True)
manifest = json.loads(Path('ml/data/manifest.json').read_text())
rows = []
for r in manifest:
    if r['split'] != 'train' or r['pose'] == 'Padamasana' or r.get('useForTraining') is not False:
        continue
    cap = cv2.VideoCapture(str(Path('dataset') / r['path']))
    fps, count = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
    tiles = []
    for index in np.linspace(0, max(0, count-1), 24).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(index))
        ok, frame = cap.read()
        tile = np.full((210, 240, 3), 245, np.uint8)
        if ok:
            h,w = frame.shape[:2]
            scale = min(240/w,185/h)
            small = cv2.resize(frame, (round(w*scale),round(h*scale)))
            h,w = small.shape[:2]
            tile[:h,(240-w)//2:(240-w)//2+w] = small
        cv2.putText(tile, f'{index/fps:.2f}s' if fps else 'decode failed', (8,203), cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,0),1)
        tiles.append(tile)
    cap.release()
    sheet = root / (r['pose'] + '-' + Path(r['path']).stem.replace(' ','-') + '.jpg')
    cv2.imwrite(str(sheet), np.vstack([np.hstack(tiles[i:i+6]) for i in range(0,24,6)]))
    cache = json.loads((Path('ml/data') / (r['sha256']+'.json')).read_text())
    frames = cache['frames']
    rows.append(dict(path=r['path'], sha256=r['sha256'], contactSheet=str(sheet), durationSeconds=count/fps if fps else None,
        completeSideFraction=sum(any(all(f['angles'][i] is not None for i in side) for side in ((0,2,4,6),(1,3,5,7))) for f in frames)/len(frames),
        jointCoverage=[sum(f['angles'][i] is not None for f in frames)/len(frames) for i in range(8)],
        reviewStatus='unreviewed', correctness=None, startMs=None, finalMs=None, endMs=None,
        repetitions=None, variant=None, useForTraining=False,
        reason='Contact sheets and visibility statistics are review aids, not verified correctness or boundaries. Retain exclusion pending full movement review.'))
(root/'report.json').write_text(json.dumps(rows,indent=2))
print(f'Generated {len(rows)} per-recording review aids; no labels changed.')
