# Twelve-pose guided practice

Implemented on `extention_to_12`. The Expo Router flow remains practice mode → calibration → the shared native camera screen. Demo previous/next navigation continues to use the same sequence data. The web camera screen remains an Android-only feature notice.

## Architecture

- `src/data/poses.ts` is the ordered source for the twelve names, descriptions, pose families and demo illustrations. Step 8 is Parvatasana / Mountain Pose.
- `src/data/practicePoses.ts` adds shared family-level camera instructions, correction coverage and manual-mode metadata. Step 4 has the left leg forward; step 9 has the right leg forward.
- `src/services/practiceEvaluator.ts` retains the original Prayer and Hasta Uttanasana rules and dispatches by family, including repetitions at steps 11 and 12.
- `src/services/sequenceEvaluator.ts` implements the new basic geometric checks. `practiceFraming.ts` selects frontal versus side tracking consistently for setup, feedback and practice.
- `useGuidedPractice`, `practiceMeasurements` and `practiceSession` retain recent-frame smoothing, small exit tolerances, freshness checks and the 800 ms interruption allowance. No uncertain samples earn hold time.
- The existing MediaPipe model, native callback integration, angle calculator and world-coordinate angle pipeline are unchanged. There is no backend/API or ontology integration in this branch; `poseDetector.ts` is an unused placeholder.

## Progression and navigation

Each camera-checked step requires stable framing for one second, a three-second countdown, then five seconds of accepted samples. A successful hold advances automatically after 1.5 seconds. Changing step clears hold/filter history and requires fresh tracking. Pause/resume repeats setup for the current step while retaining previous outcomes; Restart clears the session.

Previous pose navigates back without awarding success. Skip pose (Skip and finish on step 12) records a skip unless that step already passed checks earlier in the session. Step 6 enters manual mode after preparation and offers **Continue without camera verification**. It never earns camera hold time. A user unable to frame this manual step can explicitly skip it. The final screen counts camera-checked, manually continued and skipped steps separately; it does not claim all twelve were detected.

## Correction coverage

All rules are engineering heuristics, not validated anatomical assessments. Newly added rules are tested with coherent synthetic landmarks/angles and still require Android recordings before claiming real-world accuracy.

| Steps | Pose | Implemented checks / limitations |
|---|---|---|
| 1, 12 | Pranamasana | Existing frontal standing alignment, knees/hips, feet, hands at chest and elbow rules. Palm contact is not measured. |
| 2, 11 | Hasta Uttanasana | Existing side-profile backward direction, visible-side joints, overhead arms, hips and knees. No spinal-curvature assessment. |
| 3, 10 | Padahastasana | Forward hip fold, lowered torso/hands, hips above legs, rejection of a deep squat. Hand-to-foot contact is not measured. |
| 4, 9 | Ashwa Sanchalanasana | Correct leading leg, separated front/rear legs, front knee angle/alignment, rear hip extension, chest lift and hands beside front foot. Both legs must be tracked; knee contact is not measured. |
| 5 | Dandasana | Long body alignment, extended knees/elbows and shoulders above wrists. Does not measure weight bearing. |
| 6 | Ashtanga Namaskara | **Manual guidance only.** No automatic acceptance. MediaPipe body joints do not establish eight-point contact or chest/chin placement. |
| 7 | Bhujangasana | Lifted chest, low hips, extended legs and hands near the chest. Cannot verify mat contact or spinal curvature. |
| 8 | Parvatasana | Inverted-V geometry, raised hips, long arms/legs and hands/feet toward the mat. Heel contact is not measured. |

For new side-view poses, basic rules assess the reliable camera-facing chain; the lunge additionally requires both legs. Hidden far-side anatomy is not certified. The side-profile layout is required, with head/front foot toward the right in the mirrored preview. An overlay banner states the camera angle on every step, including during setup. Place the camera level and far enough from the mat to include the entire horizontal body for floor poses.

## Assets

No new media dependency is needed. Existing `PoseIllustration` SVG figures provide labelled schematic placeholders for the new overlays and demos. The existing `assets/hasta-uttanasana-reference.png` is reused for steps 2 and 11; Prayer keeps its existing silhouette. No nonexistent image paths are loaded.

For finished media, the suggested exact future asset files are listed below. They are **not present or referenced by the runtime** and must be created/licensed before replacing the schematics:

- `assets/poses/padahastasana-side.png` (steps 3, 10)
- `assets/poses/ashwa-sanchalanasana-left-front-side.png` (step 4)
- `assets/poses/dandasana-side.png` (step 5)
- `assets/poses/ashtanga-namaskara-side.png` (step 6)
- `assets/poses/bhujangasana-side.png` (step 7)
- `assets/poses/parvatasana-side.png` (step 8)
- `assets/poses/ashwa-sanchalanasana-right-front-side.png` (step 9)

The current lunge schematic illustrates the shape, not anatomical leg identity; the step instructions identify the correct leading leg. Demo videos/animations remain unavailable, as already labelled by `PoseMedia`.

## Verification

Completed checks: **37/37 tests passed**, TypeScript passed, `git diff --check` passed, and Android Metro/Hermes export succeeded (1,555 modules, reference image included). The first export was blocked by sandbox temporary-file permissions; the permitted rerun succeeded. This is bundle verification, not an emulator or live-camera test.

Run `npm test` and `node node_modules/typescript/bin/tsc --noEmit`. Tests retain the original 29 regression cases and add sequence metadata, coherent fixture evaluation, incorrect shapes, swapped lunge legs, repeated-pose parity, all-twelve progression and navigation/manual outcome checks. Android bundling can be checked with `node node_modules/expo/bin/cli export --platform android --output-dir .expo/sequence-export`.

Device acceptance still needed: run all twelve with side-profile framing; test both lunges and near/far-side occlusion; test wrong posture and loss of tracking during each new hold; confirm manual step 6 never displays detection success; verify Previous, Skip, Pause, background/resume and Restart; confirm step 12 produces an honest summary. Check camera-banner readability and complete floor-pose framing on small phones and different camera aspect ratios.

## File inventory

Created: `src/data/practicePoses.ts`, `src/services/practiceFraming.ts`, `src/services/sequenceEvaluator.ts`, and this document.

Modified: `app/camera.native.tsx`, `app/practice-mode.tsx`, `src/components/TargetPoseOverlay.tsx`, `src/components/demo/PoseIllustration.tsx`, `src/data/poses.ts`, `src/hooks/useGuidedPractice.ts`, `src/services/practiceEvaluator.ts`, `src/services/practiceMeasurements.ts`, `src/services/practiceSession.ts`, and `tests/practice.test.cjs`.
