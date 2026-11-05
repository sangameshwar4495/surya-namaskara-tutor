"""Export real training-video skeletons for each learned checkpoint (no test frames)."""
import json
from pathlib import Path
import cv2
import mediapipe as mp
import numpy as np
import subprocess
import os
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent


def cost(values, phase):
    common = [i for i, v in enumerate(values) if v is not None and phase['mean'][i] is not None]
    if not any(all(i in common for i in side) for side in ((0, 2, 4, 6), (1, 3, 5, 7))):
        return float('inf')
    return sum(((values[i]-phase['mean'][i])/phase['scale'][i])**2 for i in common)/len(common)


def select_frames(pose, segment, frames):
    frames = [f for f in frames if segment['startMs'] <= f['t'] <= segment['endMs']]
    costs = np.full((len(pose['phases']), len(frames)), np.inf)
    parents = np.zeros(costs.shape, dtype=int)
    for i, phase in enumerate(pose['phases']):
        best, parent = np.inf, 0
        for j, frame in enumerate(frames):
            if i and costs[i-1, j] < best:
                best, parent = costs[i-1, j], j
            final = i == len(pose['phases'])-1
            if (frame['t'] >= segment['finalMs']) != final:
                continue
            costs[i, j] = cost(frame['angles'], phase) + (best if i else 0)
            parents[i, j] = parent
    j = int(np.argmin(costs[-1]))
    score = costs[-1, j]
    chosen = []
    for i in range(len(pose['phases'])-1, -1, -1):
        chosen.append(frames[j]['t'])
        j = parents[i, j]
    return score, list(reversed(chosen))


def extract(path, timestamps):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not cap.isOpened() or fps <= 0:
        raise RuntimeError(f'Cannot open reference video {path}')
    wanted, found = set(timestamps), {}
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(ROOT/'assets/models/pose_landmarker_lite.task')),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_poses=1, min_pose_detection_confidence=.5,
        min_pose_presence_confidence=.5, min_tracking_confidence=.5)
    index, next_sample = 0, 0.
    try:
        with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                timestamp = round(index*1000/fps)
                index += 1
                if timestamp > max(wanted):
                    break
                if timestamp < next_sample:
                    continue
                next_sample += 125
                h, w = frame.shape[:2]
                aspect = w/h
                if max(h,w) > 960:
                    frame = cv2.resize(frame,(round(w*960/max(h,w)), round(h*960/max(h,w))))
                result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,
                    data=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)), timestamp)
                if timestamp in wanted and result.pose_landmarks:
                    found[timestamp] = [dict(x=p.x*aspect, y=p.y, z=0,
                        visibility=min(p.visibility,p.presence)) for p in result.pose_landmarks[0]]
    finally:
        cap.release()
    if any(t not in found for t in wanted):
        raise RuntimeError(f'Missing landmarks at a selected reference timestamp: {path}')
    # One common transform for the entire movement: no frame-by-frame stretching.
    body = [p for points in found.values() for i,p in enumerate(points)
            if (i == 0 or i >= 11) and p['visibility'] >= .6]
    xmin, xmax = min(p['x'] for p in body), max(p['x'] for p in body)
    ymin, ymax = min(p['y'] for p in body), max(p['y'] for p in body)
    scale = min(.84*.75/max(xmax-xmin,.01), .8/max(ymax-ymin,.01))
    normalized = {t:[{**p,'x':round(.5+(p['x']-(xmin+xmax)/2)*scale/.75,5),
                          'y':round(.5+(p['y']-(ymin+ymax)/2)*scale,5),
                          'visibility':round(p['visibility'],4)} for p in points] for t,points in found.items()}
    crop = {'x':max(0,xmin/aspect-.04),'y':max(0,ymin-.04),
            'right':min(1,xmax/aspect+.04),'bottom':min(1,ymax+.04)}
    return [normalized[t] for t in timestamps], crop


def export_video(name, path, segment, crop):
    cap=cv2.VideoCapture(str(ROOT/'dataset'/path))
    width,height=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    x,y=int(crop['x']*width)//2*2,int(crop['y']*height)//2*2
    w=max(2,(int(crop['right']*width)-x)//2*2)
    h=max(2,(int(crop['bottom']*height)-y)//2*2)
    target=ROOT/f'assets/demos/{name}.mp4'
    target.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error',
        '-ss',str(segment['startMs']/1000),'-i',str(ROOT/'dataset'/path),
        '-t',str((segment['endMs']-segment['startMs'])/1000),'-an',
        '-vf',f'crop={w}:{h}:{x}:{y},scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1',
        '-r','24','-c:v','libx264','-preset','fast','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],
        check=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    return {'aspectRatio':w/h,'durationMs':segment['endMs']-segment['startMs']}


def main():
    model = json.loads((ROOT/'src/data/temporalModel.json').read_text())
    report = json.loads((ROOT/'ml/reports/evaluation.json').read_text())
    manifest = {r['path']:r for r in json.loads((ROOT/'ml/data/manifest.json').read_text())}
    output = {'version':1,'modelKey':model['referenceKey'],'sourceAspect':.75,'poses':[]}
    demos=[]
    for pose in model['poses']:
        candidates = []
        for segment in report['trainingSegments']:
            row = manifest[segment['path']]
            if row['split'] != 'train' or row['pose'] != pose['name']:
                continue
            if row['sha256'] not in model['provenance']['trainingHashes']:
                raise RuntimeError('Reference source was not used for training')
            frames = json.loads((ROOT/f"ml/data/{row['sha256']}.json").read_text())['frames']
            score,timestamps = select_frames(pose,segment,frames)
            candidates.append((score,segment['path'],timestamps))
        score,path,timestamps = min(candidates)
        if not np.isfinite(score):
            raise RuntimeError(f'No observable reference trajectory for {pose["name"]}')
        landmarks,crop = extract(ROOT/'dataset'/path,timestamps)
        segment=next(s for s in report['trainingSegments'] if s['path']==path)
        demo=export_video(pose['name'],path,segment,crop)
        demos.append(f"  {json.dumps(pose['name'])}: {{source: require('../../assets/demos/{pose['name']}.mp4'), aspectRatio: {demo['aspectRatio']}, durationMs: {demo['durationMs']}}}")
        output['poses'].append({'name':pose['name'],'source':path,'timestamps':timestamps,
                                'phases':[{'landmarks':p} for p in landmarks]})
        print(f'{pose["name"]}: {path}, {len(landmarks)} checkpoint skeletons',flush=True)
    (ROOT/'src/data/temporalReferences.json').write_text(json.dumps(output,allow_nan=False,separators=(',',':')))
    (ROOT/'src/data/datasetDemos.ts').write_text('// Generated from training segments. Rebuild with npm run ml:references.\n'
        +'export const DEMO_MODEL_KEY = '+json.dumps(model['referenceKey'])+';\n'
        +'export const DATASET_DEMOS: Record<string, {source: number; aspectRatio: number; durationMs: number}> = {\n'+',\n'.join(demos)+'\n};\n')


if __name__ == '__main__':
    main()
