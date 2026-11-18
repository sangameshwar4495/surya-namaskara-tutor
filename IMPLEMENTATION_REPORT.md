# Local yoga coaching implementation — 18 November 2026

This work improves the existing Expo/React Native, MediaPipe and DTW application locally. It does **not** establish production reliability or complete all proposed correction categories. No remote Git operations, branch changes, commits, dataset deletion, or label changes were performed. The starting worktree was clean.

## Pipeline audit and root causes

Inspected the training pipeline, extraction/indexing, reviewed boundaries, diagnostics and historical results; runtime angle extraction, temporal tracking, continuous practice, guidance, feedback, detection/speech hooks, practice screen, overlay, model and automated tests.

* Training reads reviewed entry/hold windows, samples 24 entry positions, aligns angle sequences with DTW, and combines aligned demonstrations with medians and MAD spreads. It simplifies the trajectory into meaningful stages and calibrates on whole held-out training videos. Left/right variants are expressed in a canonical orientation before fitting.
* The eight features are 3D world-coordinate knee, elbow, shoulder and hip angles. Offline extraction uses image visibility/presence >= .6; live angle calculation initially accepts .3 and the practice screen masks joints at .6 plus frame-edge checks. These gates are not completely identical. No new angle-cache equivalence is claimed.
* Phase recognition trims the worst quarter of residuals; correctness separately checks all available joints. Trimming could discard **every moving joint** where only one or two joints move. The fix retains the best available moving-joint evidence only in that case. One bad limb can still be ignored for recognition, but not for correction.
* Moving-joint roles allow a broad start-to-end band. That handles speed differences but misses bilateral timing mistakes. Widening every tolerance would worsen this; the old DTW tolerances are preserved.
* Generic angle-to-sentence mapping cannot establish torso tilt, foot placement, chest elevation or forward-vs-sideways bending. The new classifier suppresses these unsupported directional claims rather than pretending a hip angle identifies them.
* Raw per-frame corrections were displayed immediately and speech repeated every five seconds. Corrections now require elapsed-time persistence; speech announces each distinct message at most once per attempt.
* A final posture still does not verify earlier movement. The existing coverage, reversal and tracking-loss records remain in use. New persistent entry errors remain in the summary after correction; final-alignment corrections are not mislabeled as entry mistakes.

## Dataset audit

All source videos and angle caches are present. Training inclusion is unchanged:

| Pose | Available | Previously included, retained | Excluded, retained |
|---|---:|---:|---:|
| Tadasana | 12 | 6 | 6 |
| Vrikshasana | 11 | 4 | 7 |
| Trikasana | 10 | 5 | 5 |
| Bhujasana | 12 | 6 | 6 |
| Total | 45 | 21 | 24 |

Generated **24 timestamped contact sheets and 24 per-recording metadata/visibility reports**, in `ml/reports/excluded-review/`. Every report retains unknown correctness, boundaries, repetition count and variant as null. No excluded recording was promoted: **0 newly verified/included**. These are review aids, not 24 completed correctness reviews. A spot inspection of Vrikshasana video 10 shows an already-held stance at the beginning and a later opposite-side performance; a whole-video label would obscure its segmentation requirements. Full motion correctness and precise boundaries remain unreviewed.

The permitted contact-sheet fallback is used because sparse frames cannot reliably validate continuous movement, occluded joints or exact boundaries. Original reviewed annotations and test recordings remain untouched. Performer independence is declared by the existing dataset policy, not verified from newly collected identities. No real incorrect-performance recordings were identified in the existing dataset documentation.

## Training and features

The original DTW artifact, landmark reference key and bundled demonstrations are unchanged. A new **supplemental** `relationshipModel.json` is fitted from the six already-included Tadasana training videos, with no test input. It records a bilateral shoulder-angle difference envelope: per-video q99 plus a leave-one-video-out upper-envelope residual, with explicit engineering floors. The resulting limit is **31.587658 degrees**. This is a conservative small-sample envelope, not a probability-calibrated threshold.

Its schema is `bilateral-shoulder-difference-v1`, version 1, bound to the DTW model's reference key and training hashes. The screen disables this relationship if schema/version/key do not match. Existing references are not silently reinterpreted as a larger feature vector.

The live detector now retains world landmarks. Arm-lag advice requires torso-normalized wrist elevation to corroborate shoulder asymmetry when world landmarks are supplied. This measurement is translation, scale and mirror invariant and visibility gated. Legacy angle caches lack world landmarks; offline arm-lag evaluation is explicitly a weaker angle-only proxy. A geometry-cache regeneration and calibration run remains outstanding.

## Tracking, classifier and controller

`MovementCoach` wraps, rather than replaces, `ContinuousPractice`. The tracker still owns phase recognition, coverage, reversal and final hold. It precomputes interpolated reference points once per instance instead of rebuilding them for every camera frame. The new layer owns evidence, persistence, correction selection and entry-error history.

`ClassifiedError` carries an identity, pose/phase, physical error type, anatomical joints, highlight landmarks, severity, evidence completeness, measured evidence, persistence and state. Confidence means completeness of rule evidence, **not validated accuracy**. Independent moving-joint progress comes from the learned start/final angles and is exposed in diagnostics.

| Pose | Implemented supported rules |
|---|---|
| Tadasana | Left/right arm lag with training-derived bilateral limit and live wrist corroboration; observable knee bending, elbow extension and final upper-arm alignment |
| Vrikshasana | Supporting knee bending, lifting-knee progression, elbow extension and final arm alignment; anatomical sides preserved after reference mirroring |
| Trikasana | Observable knee bending, elbow extension and upper-arm alignment relative to the learned reference |
| Bhujasana | Observable knee bending, phase-relative elbow extension and upper-arm alignment |

Rules operate only on measured deviations, not unconditional textbook posture requirements. Errors involving hips do not generate speculative torso instructions. Shoulder-angle instructions describe movement relative to the torso unless wrist evidence supports “raise”. The overhead-arm Vrikshasana variant is explicitly reported unsupported when the fitted reference calls for chest-level hands; it is not averaged into that reference. No new variant was trained without verified examples.

Persistence defaults to 500 ms with a 500 ms maximum observation gap. Stale timestamps do not earn time. Occluded joints suspend errors without announcing resolution. Correcting a visible error clears it immediately, with occasional written reinforcement. History is bounded by the finite rule identities. The spoken controller retains its existing five-second spacing and now deduplicates instructions for the entire attempt. No competing speech hook was created.

## Live UI

The original camera, demonstration, final-hold bar and review remain. The screen now uses the coaching controller, shows movement phase/progress, one primary and optional secondary correction, and highlights the complete affected arm/leg chain through the existing overlay. Diagnostic visibility is guarded by `__DEV__` and includes pose, side, phase, hold, angles, visibility, reference deviation, per-joint progress, candidate/active/resolved errors, suppression reasons and speech state.

Speech requests wait while another utterance is active. A processed-frame timestamp guard prevents speech state updates from evaluating the same frame twice. Existing pause/resume behavior is retained: resuming starts a fresh attempt. Anatomical joint indices never swap merely because the preview is mirrored. Physical Android camera/overlay correspondence still requires device validation.

## Actual validation

Baseline: **93/93 tests passed**, `npx tsc --noEmit` passed. Updated: **105/105 tests passed**, TypeScript passed. New tests cover both lagging arms, canonical mirroring, correct progress, missing reference/visibility, 8/15/30 fps persistence, full and partial tracking loss, normalized geometry invariance, contradictory geometry, rules across all four poses, lifting/supporting knee direction, unsupported tree variant, and an integrated detect/highlight/resolve/summary case. Existing tests cover reversal, skipped movement, coverage, speed-independent traversal and final-hold loss.

Training-only synthetic benchmark (`node ml/diagnose.cjs --mistakes --rows`) is unchanged for the default tracker:

| Metric | Baseline | Updated |
|---|---:|---:|
| Completed correct demonstrations | 18/21 | 18/21 |
| Completed movements judged correct | 4/18 | 4/18 |
| Completed demonstrations with summary correction | 3/18 | 3/18 |
| Injected knee bend caught | 17/21 | 17/21 |
| Injected elbow bend caught | 6/21 | 6/21 |
| Injected hip bend caught | 17/21 | 17/21 |
| Injected reversal caught | 8/21 | 8/21 |

Full-recording coaching comparison (nested training-video holdout; fixed original test references):

| Metric | Development baseline → updated | Test baseline → updated |
|---|---:|---:|
| Final completion | 18/21 → 18/21 | 9/12 → 9/12 |
| Movements judged correct | 4 → 4 | 3 → 2 |
| Completed recordings with summary corrections | 3 → 3 | 3 → 4 |
| Recordings with live spoken corrections | 6 → 4 | 7 → 2 |
| Phase changes, whole recordings | 297 → 295 | 299 → 287 |

**This is mixed evidence, not a blanket accuracy improvement.** Fewer live corrections also result from suppressing ambiguous advice. One additional test Tadasana asymmetry correction worsens its angle-only summary result; no thresholds were adjusted to remove that test failure. The live wrist check cannot be evaluated from these old caches. Phase changes are not a labeled phase-instability rate. Incorrect-side accuracy, real error recall and actual speech latency remain unknown. Synthetic activation latency is 500 ms plus at most a sample interval; speech additionally waits for controller stability/cooldown and the current utterance. The comparison uses the new deduplicating speech controller for both tracker versions.

Reports are local in `ml/reports/baseline-tests.txt`, `baseline-types.txt`, `baseline-mistakes.txt`, `updated-tests.txt`, `updated-types.txt`, `updated-mistakes.txt`, and `coaching-evaluation.json`. Reports/caches are git-ignored by existing policy. No Android-device test or native build was performed in this work.

## Remaining work and limitations

* Expert continuous-video review is required before adding any of the 24 excluded recordings or splitting repetitions. No expanded-data DTW retraining is claimed.
* Torso tilt/direction, chest elevation, forward lean, lifted-foot placement, and shoulder positioning beyond upper-arm angles are **not activated**: they need viewpoint-aware geometric references and validation. Weight distribution, exact ground contact and internal stress are not inferred.
* Incorrect movement recordings and fresh held-out performers are needed to measure missed errors, wrong-side errors and false feedback. Existing test videos were already inspected during earlier project development.
* Separate overhead tree and other movement variants need verified data, their own trajectories and UI selection. Currently only the existing references and their opposite-side versions are supported.
* Setup/final-alignment false corrections still occur. Existing generic summary corrections are retained for compatibility; the new live layer does not make every historical summary sentence biomechanically specific.
* The live/offline visibility and geometry paths need fresh paired recordings. This implementation is an incremental improvement, not fulfillment of every candidate detector in the original brief.

## Files changed or added

* `app/dataset-practice.native.tsx` — controller, evidence input, diagnostics, progress, secondary feedback, speech/frame guards.
* `src/services/continuousPractice.ts` — moving-joint recognition safeguard, cached interpolated reference points, engagement metadata.
* `src/services/errorClassifier.ts` — typed pose-specific evidence, normalized wrist measurement, elapsed-time persistence.
* `src/services/movementCoach.ts` — integrated tracker/classifier/controller and entry-error summary preservation.
* `src/services/learnedGuidance.ts` — persistent anatomical chain highlighting and explicit chest-level tree setup.
* `src/services/liveFeedback.ts` — once-per-attempt speech deduplication.
* `src/services/processDetection.ts`, `src/types/pose.ts` — retain world landmarks and combine world/image confidence.
* `src/data/relationshipModel.json` — locally trained, versioned relationship artifact.
* `ml/audit-excluded.py` — reproducible per-excluded-video review aids, no annotation mutations.
* `ml/train-relationships.cjs` — training-only supplemental calibration.
* `ml/evaluate-coaching.cjs` — whole-recording baseline/updated comparison with explicit limitations.
* `tests/coaching.test.cjs`, `tests/continuous.test.cjs` — new behavioral tests and updated non-repeating speech contract.
* `IMPLEMENTATION_REPORT.md` — this audit, implementation record, evidence and remaining work.

## Run locally

Dependencies are already installed. From this project directory:

```powershell
npm test
npx tsc --noEmit
node ml/train-relationships.cjs
node ml/diagnose.cjs --mistakes --rows
node ml/evaluate-coaching.cjs
.\.venv\Scripts\python.exe ml/audit-excluded.py
npm start
```

Use the existing Android development build (native MediaPipe/Vision Camera modules require a development build, not ordinary Expo Go). If a new build is required and Android tooling/device are available, run `npm run android`. Select Practice yoga poses, select one of the supported poses, position the full body, and start. Test both anatomical sides, brief occlusion, slow/fast entries, arm lag and correction. Toggle Show diagnostics in a development build. Do not interpret a final hold as verification of the complete entry; read the movement summary.
