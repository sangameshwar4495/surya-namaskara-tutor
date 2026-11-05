"""Quick visual audit of one training recording per class (not correctness labels)."""
from pathlib import Path
import cv2
import numpy as np

out = Path('ml/reports')
out.mkdir(parents=True, exist_ok=True)
for folder in sorted(Path('dataset/train').iterdir()):
    if not folder.is_dir():
        continue
    video = sorted(folder.glob('*.mp4'))[0]
    cap = cv2.VideoCapture(str(video))
    count, fps = cap.get(cv2.CAP_PROP_FRAME_COUNT), cap.get(cv2.CAP_PROP_FPS)
    tiles = []
    for fraction in np.linspace(.03, .97, 8):
        index = int(count * fraction)
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        tile = np.full((280, 320, 3), 245, dtype=np.uint8)
        if ok:
            h, w = frame.shape[:2]
            resized = cv2.resize(frame, (round(w*min(320/w,250/h)), round(h*min(320/w,250/h))))
            h, w = resized.shape[:2]
            tile[:h, (320-w)//2:(320-w)//2+w] = resized
        cv2.putText(tile, f'{index/fps:.1f}s', (10, 272), cv2.FONT_HERSHEY_SIMPLEX, .6, (20,20,20), 1)
        tiles.append(tile)
    cap.release()
    cv2.imwrite(str(out / f'{folder.name}.jpg'), np.vstack([np.hstack(tiles[:4]),np.hstack(tiles[4:])]))
    print(video, round(count/fps, 2), 'seconds')
