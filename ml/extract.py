"""Extract timestamped world-coordinate joint angles; never fill missing joints."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

JOINTS = [(23,25,27), (24,26,28), (11,13,15), (12,14,16),
          (13,11,23), (14,12,24), (11,23,25), (12,24,26)]


def angles(result):
    if not result.pose_world_landmarks or not result.pose_landmarks:
        return [None] * 8
    world, image = result.pose_world_landmarks[0], result.pose_landmarks[0]
    values = []
    for indices in JOINTS:
        if any(min(image[i].visibility, image[i].presence) < .6 for i in indices):
            values.append(None)
            continue
        a, b, c = [np.array([world[i].x, world[i].y, world[i].z]) for i in indices]
        u, v = a-b, c-b
        norm = np.linalg.norm(u) * np.linalg.norm(v)
        value = float(np.degrees(np.arccos(np.clip(np.dot(u, v)/norm, -1, 1)))) if norm > 1e-10 else None
        values.append(value if value is not None and np.isfinite(value) else None)
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, default=Path('dataset'))
    parser.add_argument('--output', type=Path, default=Path('ml/data'))
    parser.add_argument('--model', type=Path, default=Path('assets/models/pose_landmarker_lite.task'))
    parser.add_argument('--fps', type=float, default=8)
    parser.add_argument('--poses', nargs='+', help='Process only these dataset folders')
    parser.add_argument('--cache-only', action='store_true', help='Write feature caches without changing the manifest')
    args = parser.parse_args()
    if not 1 <= args.fps <= 30:
        parser.error('--fps must be between 1 and 30')
    args.output.mkdir(parents=True, exist_ok=True)
    model_hash = hashlib.sha256(args.model.read_bytes()).hexdigest()
    manifest_path = args.output / 'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    previous = {r['path']: r for r in old}
    records = []
    videos = sorted(args.dataset.glob('*/*/*'))
    for path in videos:
        if path.suffix.lower() not in ('.mp4', '.avi', '.mov', '.mkv'):
            continue
        relative = path.relative_to(args.dataset).as_posix()
        split, pose, _ = relative.split('/')
        if split not in ('train', 'test'):
            continue
        if args.poses and pose not in args.poses:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        cache = args.output / f'{digest}.json'
        record = previous.get(relative, {}) if previous.get(relative, {}).get('sha256') == digest else {}
        record = {**record, 'path': relative, 'split': split, 'pose': pose, 'sha256': digest,
                  'subject': record.get('subject'), 'correct': record.get('correct'),
                  'startMs': record.get('startMs'), 'finalMs': record.get('finalMs'), 'endMs': record.get('endMs')}
        cached = json.loads(cache.read_text()) if cache.exists() else None
        if cached and cached.get('modelHash') == model_hash and cached.get('sampleFps') == args.fps:
            records.append(record)
            continue
        cap = cv2.VideoCapture(str(path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not cap.isOpened() or not np.isfinite(fps) or fps <= 0:
            raise RuntimeError(f'Cannot decode {path}')
        frames, index, next_sample = [], 0, 0.
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(args.model)),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_poses=1, min_pose_detection_confidence=.5,
            min_pose_presence_confidence=.5, min_tracking_confidence=.5)
        try:
            with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
                while True:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    timestamp = round(index * 1000 / fps)
                    index += 1
                    if timestamp < next_sample:
                        continue
                    next_sample += 1000 / args.fps
                    # Reduce inference cost while preserving aspect ratio.
                    height, width = frame.shape[:2]
                    if max(height, width) > 960:
                        frame = cv2.resize(frame, (round(width*960/max(height,width)), round(height*960/max(height,width))))
                    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                    result = detector.detect_for_video(image, timestamp)
                    frames.append({'t': timestamp, 'angles': angles(result)})
        finally:
            cap.release()
        if not frames:
            raise RuntimeError(f'No frames decoded: {path}')
        cache.write_text(json.dumps({'version': 1, 'modelHash': model_hash, 'sampleFps': args.fps,
                                     'frames': frames}, allow_nan=False))
        records.append(record)
        usable = sum(any(all(f['angles'][i] is not None for i in side) for side in ((0,2,4,6),(1,3,5,7))) for f in frames)
        print(f'{relative}: {len(frames)} frames, {usable} with complete visible side', flush=True)
        # Save progress and preserve manual annotations on rerun.
        if not args.cache_only:
            manifest_path.write_text(json.dumps(records + [r for r in old if r['path'] not in {x['path'] for x in records}], indent=2))
    if not records:
        raise RuntimeError('No dataset videos found')
    if not args.cache_only:
        manifest_path.write_text(json.dumps(records + [r for r in old if r['path'] not in {x['path'] for x in records}], indent=2))


if __name__ == '__main__':
    main()
