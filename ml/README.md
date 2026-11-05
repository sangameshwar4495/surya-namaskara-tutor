# Continuous movement learning and practice

The app assesses **entry into a pose while the person moves**, then checks a final
hold. There are no intermediate hold timers or checkpoint gates in learned practice.
The original 12-asana geometric practice remains a separate mode.

## User experience

1. Choose **Learned movement practice**. The screen shows only the pose name, one setup
   line and a live camera preview (so people can frame themselves before starting).
   Permission, missing-camera, camera-starting and camera-error states are shown
   inside the preview, with Allow/Open settings/Try again actions.
2. **Start movement** expands the preview edge-to-edge (status bar hidden, safe-area
   insets respected). The image keeps its aspect ratio (`contain`, never stretched); the
   status line, hold bar and controls sit in a panel *below* the image, not over it.
   No text overlays the top of the preview; the countdown is a small badge.
3. The pose name and setup line are spoken, then a three-second countdown runs before
   scoring. A muted training demonstration loops in a corner, size-limited to about a third
   of the preview in each direction; tap it to swap corners. Playback pauses with practice.
4. Live landmarks appear on the camera preview. Orange joints and one short cue
   indicate deviations; users correct them without stopping their movement.
5. Once the final pose stays within the learned ranges for 1.5 seconds, the attempt
   ends with a short written and spoken review (persistent joint corrections, and
   whether part of the movement was not clearly seen). The app then **advances to the
   next pose automatically**: 3 s after the spoken review ends, or 8 s if voice is off or
   fails, so the text can be read. "Stay here" cancels the advance; Repeat restarts the
   pose. After the last pose the review ends with "That completes your practice" and the
   panel offers Done, Repeat or Start again; it does not navigate away on its own.
6. Voice can be muted and the review replayed (replaying cancels the auto-advance).
   Text remains available when the device's speech engine fails, and a speech engine
   that never reports completion cannot block the countdown (12 s fallback). Pause
   leaves full screen; resuming starts a new attempt.

**Finishing the final hold does not mean the entire movement was correct.** Missing
sections remain unverified and earlier errors remain in the summary. The app does
not force a return to a missed checkpoint or conceal it when the final pose matches.

## Model and background measurements

MediaPipe Lite extracts eight world-coordinate joint angles at 8 fps: left/right
knee, elbow, shoulder and hip. Hidden or invalid joints remain missing. A complete
visible-side chain is required for scoring. The same feature order, confidence
gate and evaluator are used offline and in the camera screen.

Training uses temporal alignment (DTW), robust angle medians and median absolute
deviations. Thresholds are calibrated by leaving out entire training videos;
test videos never enter fitting or threshold calibration. Test recordings are
evaluated by streaming the whole video through the same evaluator as the app,
with no boundaries; a recording is unscorable when under 60% of its frames have a
complete visible side. The training trajectory
has a dense internal representation, then trajectory simplification selects its
meaningful changes using learned spread. The stage count is **data-dependent**,
not a fixed twelve. The current export has:

| Pose folder | Intermediate stages | Final hold |
| --- | ---: | ---: |
| Tadasana | 7 | 1 |
| Vrikshasana | 4 | 1 |
| Trikasana | 4 | 1 |
| Bhujasana | 3 | 1 |
| Padamasana | 2 | 1 |

Stage names are internal. Text and speech never name stages; they give the pose, one
setup line and joint corrections only.

**Side orientation.** Vrikshasana and Trikasana are demonstrated on both sides. Before
fitting, each clip is expressed in one left/right orientation (the anchor is the clip
whose final pose is closest to all others). At runtime both the observed angles and
their left/right swap are scored; the better fit is used (ties keep the current side),
and corrections are mapped back to the user's real side.

`ContinuousPractice` estimates the closest movement stage from most observable
joints so one bent elbow does not freeze progress. Large forward jumps require
confirmation across at least 100 ms. Backward motion can be observed; it does not
erase prior errors. Stage recognition and correctness are separate:

* **Recognition:** identifies where the person appears to be in the movement.
* **Correctness:** calculates RMS degree error, normalized error and every visible
  joint's signed deviation. It uses all observed joints, including those omitted
  from the robust recognition cost.
* **Coverage:** records each intermediate section as observed/unobserved and whether
  it ever matched. A skipped/unseen section can never be marked correct by jumping
  to the final pose.
* **Error history:** accumulates consecutive error-sample intervals. Recurring
  runs can accumulate; a lone noisy frame contributes no duration. Errors totaling
  at least 250 ms are grouped by joint and direction for speech. Every such group
  is in the written review (most persistent first) and the three most persistent are
  spoken, with early/midway/near-the-end context. Brief sections that never match are
  marked for review without inventing a confident corrective diagnosis.
* **Tracking:** missing or stale data cannot count toward the final hold. Gaps over
  500 ms interrupt the hold and flag the attempt as incompletely observed. History
  is preserved until Repeat/Restart rather than silently discarded.
* **Final hold:** the last intermediate stage is nearly identical to the final pose,
  so while the pose stays within the *final* stage's own tolerance (and recognition is
  at the last two stages or a hold is under way) the final stage stays selected.
  Otherwise alternating recognition reset every hold. Out-of-range blips under 250 ms
  neither reset nor earn hold time.

Per-joint allowance is `clamp(learnedScale * jointThreshold, 5, 20)` degrees, alongside
the normalized RMS threshold (clamped to [1.5, 3]). Both are calibrated by leaving out
whole training videos, on the statistic the runtime checks: per frame for intermediate
stages; for the final stage, the q90 across held-out videos of the smallest single-joint
multiplier that gives the video one continuous 1.5 s in-range run. Older model files
without `jointThreshold` fall back to the RMS threshold. These engineering limits are
not medically validated, and several final-pose joints now sit at the 20° cap (see
`ml/RESULTS.md`). Only the final stage needs a continuous 1.5-second hold. Summary
completion is latched so the user can relax while listening.

`TemporalTracker` remains as a legacy evaluator with regression tests; learned
practice and current dataset evaluation use `ContinuousPractice`.

## Demonstrations and voice

`ml/export_references.py` selects a representative **training** video per pose,
exports stage skeletons for inspection, and uses FFmpeg to crop and encode the
selected entry/hold interval as a small H.264 MP4 with no audio. The five videos
are bundled in `assets/demos/`; no external video service is needed. They replay
at the recording's speed independently of the user. These are selected reference
intervals, not newly filmed tutorials; Padamasana's interval still needs review.

`expo-video` renders the corner view using an Android texture surface. The live
skeleton uses the camera's contained image rectangle so the video does not change
landmark placement. Generated media includes a model fingerprint; stale media is
not presented as the demonstration for a newly trained model.

`expo-speech` uses the phone's voices, preferring an enhanced English voice when
available and a calm rate of 0.88. The exact voice depends on the device and its
installed TTS engine. There is no promise that every phone has the same voice or
that its speech engine works offline. No developer speech API key is required.
Introductions, final-hold cues and summaries replace queued speech. Cancellation
tokens stop asynchronous voice loading from speaking after navigation/muting.
Long summaries are chunked without dropping correction groups.

## Reproduce the pipeline (PowerShell, repository root)

```powershell
uv venv --python 3.11 .venv
uv pip install --python .venv/Scripts/python.exe -r ml/requirements-lock.txt
npm install
npm run ml:index
npm run ml:extract
npm run ml:apply-boundaries
npm run ml:train:draft
npm test
npx tsc --noEmit
```

The lock records Python 3.11/Windows dependencies; use `ml/requirements.txt` for
other compatible platforms. Extraction uses three workers and resumable caches.
All indexed videos must have compatible caches before training. `ml:train:draft`
exports the model, evaluation, skeleton references and demonstration videos.
Use `npm run ml:references` to regenerate only media. Rebuild Android after adding
`expo-video` and `expo-speech`: **a Metro reload alone cannot add native modules**.

## Data review and limitations

The owner confirmed all recordings are intended correct demonstrations and
train/test performers are different (`ml/dataset-policy.json`). The supplied
corpus has 56 training and 15 test videos. The current artifact uses 25 training
videos: 21 with approximate visually reviewed entry/hold boundaries and four
Padamasana clips with automatic proposals. Review decisions and source hashes
are recorded in `ml/reviewed-boundaries.json`.

`npm run ml:review` creates `ml/reports/review.html`. Review each source and edit
`startMs`, `finalMs`, `endMs`, `correct`, and `subject`; download the manifest and
replace `ml/data/manifest.json`. Excluded training clips have `useForTraining:false`;
change that only after reviewing their complete entry and pose variant. Then run
`npm run ml:train` for reviewed-only training. At least four usable references per
pose are required. Exact duplicates and known subject overlap stop training;
different encodings and missing performer IDs still require manual auditing.

Automatic boundaries can mistake a release or repetition for entry into a pose.
Crossed legs, viewpoint and different movement variants can defeat landmark/phase
recognition. The five poses are separate attempts; the videos do not teach movement
between asanas or Surya Namaskar. Angle-only features do not establish contact,
balance, spinal curvature or all movement directions.

**Current evaluation (full recordings, as the app sees them): 10/15 correct test
recordings complete the final hold (10/13 scorable; Padamasana 13 and 14 unscorable),
0/15 verify the full movement, and 9 of the 10 completions still receive at least one
false spoken correction.** Nested leave-one-video-out on training videos gives 18/25
completions (previously 13/25). Cross-pose completions are 0/60 (test) and 0/224
(training). The earlier "0/10" came mainly from evaluating only an automatically
proposed ~2 s window and from a hold timer reset by stage aliasing; see
`ml/RESULTS.md` for the diagnosis, ablation and per-pose results. These are reference-match
rates on correct demonstrations, not accuracy. Intermediate corrections are not
reliable yet, and no error-detection accuracy can be estimated without labeled
incorrect examples. The test set has been inspected during development and is not a
pristine final benchmark.

`node ml/diagnose.cjs` prints the training-only ablation; `--trace "<clip path>"`
prints a frame-by-frame trace (stage, status, hold, side, out-of-tolerance joints).
`ml/reports/evaluation.json` includes per-frame traces for every test recording, and
`summary.json` has development/test tallies and cross-pose rows. Model parameters and
compact derived demos are versioned; source videos, caches and reports are local.

API references: [Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/),
[Expo Video](https://docs.expo.dev/versions/latest/sdk/video/),
[MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python).
Installed Expo SDK 54 package types were used for implementation compatibility.
