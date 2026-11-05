# Development evaluation — final-hold diagnosis update (2026-11-06)

This is an experimental one-class movement-reference model (DTW-aligned joint-angle
references with learned tolerances), **not** a neural network and not a validated
correct/incorrect classifier. The owner confirmed that every video demonstrates the
pose correctly and that training and test performers are different people. There are
no labeled incorrect performances and no expert intermediate-phase labels.

## Why correct performances were rejected

The previous report showed 0 of 10 scorable test performances completing the final
hold, with 5 more unscorable. Those were correct demonstrations, so the failures came
from the pipeline. A frame-by-frame trace of a representative correct clip
(`node ml/diagnose.cjs --trace "test/Tadasana/video 13.mp4"`) plus leave-one-video-out
checks on **training** videos found four independent mechanisms:

1. **The evaluation never looked at the final hold (harness bug, test only).** Test
   videos are 38–63 s long, but each was evaluated only inside an automatically
   proposed window of 3.5–7 s. The proposer takes the *first* 2-second plateau, which
   was usually the starting stance, and its "hold" was always exactly 2 s. In Tadasana 13 the window
   was 0.9–14.9 s while the performer actually held the final pose from about 31 s to
   54 s. Five clips were labelled "unscorable" only because the proposer found no
   plateau, not because tracking failed.
2. **Stage aliasing reset every hold (runtime bug).** The last intermediate stage is,
   by construction, almost the final pose (4.8–8.6° RMS apart for Tadasana,
   Vrikshasana and Bhujasana, inside the 8–20° tolerances). Nearest-stage recognition
   alternated between the two. Each switch reset the hold timer, so in the trace a
   ~23-second, fully in-range hold never accumulated 1.5 s.
3. **Left and right variants were averaged (model bug).** Vrikshasana video 2 lifts the
   left leg while the other three lift the right. Trikasana videos 3 and 5 bend to the
   other side. One un-mirrored reference mixed both variants: Vrikshasana's right-knee
   spread was 32°, and held-out opposite-side performers showed ±90° "errors".
4. **Tolerances were calibrated on a different statistic than the one checked.**
   Calibration used the RMS of DTW-group medians and hold medians. The runtime then
   applied that RMS multiplier to every single joint, frame by frame. The worst joint
   in a noisy frame naturally exceeds an RMS of medians, so the check was stricter
   than anything it was calibrated on.

## What changed

| Change | Where | Why |
| --- | --- | --- |
| Test evaluation streams the **whole recording**, as the app does; "unscorable" means under 60% of frames have a complete visible side (the same rule used for training segments) | `ml/pipeline.cjs` | Mechanism 1 |
| While the pose stays within the **final** stage's own tolerance, the final stage stays selected (only once recognition is at the last two stages or a hold is under way) | `src/services/continuousPractice.ts` | Mechanism 2 |
| Out-of-range blips under 250 ms (the existing persistent-error definition) neither reset nor earn hold time | same | Noise; no measurable offline effect at 8 fps, kept for 30 fps live input |
| Training clips are put in one left/right orientation; at runtime both orientations are scored, and corrections are mapped back to the user's real side | `ml/pipeline.cjs`, `continuousPractice.ts`, `temporalPose.ts` | Mechanism 3 |
| Intermediate stages are calibrated per frame. The final stage is calibrated as the q90, across held-out videos, of the smallest single-joint multiplier giving that video one continuous 1.5 s in-range run. The 5–20° per-joint bounds and the RMS [1.5, 3] bounds are unchanged | `ml/pipeline.cjs` | Mechanism 4 |

Every choice was made with nested leave-one-video-out on the 25 training videos
(`node ml/diagnose.cjs`, which does not read test data). Each held-out recording is
streamed in full through the runtime evaluator against a model whose tolerances were
calibrated without it.

## Development results (training videos only, nested leave-one-video-out)

| Step (cumulative) | Held-out complete | Tada | Vriks | Trika | Bhuja | Padam | Cross-pose completions | Mean final tolerance (Tada/Vriks/Trika/Bhuja/Padam) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 previous algorithm | 13/25 | 4/6 | 2/4 | 2/5 | 5/6 | 0/4 | 0/224 | 7.7 / 18.8 / 17.0 / 9.5 / 19.2° |
| 1 + final-hold hysteresis | 17/25 | 5/6 | 3/4 | 4/5 | 5/6 | 0/4 | 0/224 | unchanged |
| 2 + 250 ms grace | 17/25 | 5/6 | 3/4 | 4/5 | 5/6 | 0/4 | 0/224 | unchanged |
| 3 + side orientation | 14/25 | 4/6 | 1/4 | 4/5 | 5/6 | 0/4 | 0/224 | 7.6 / 13.4 / 12.9 / 9.5 / 19.4° |
| **4 + runtime-matched calibration (chosen)** | **18/25** | 5/6 | 3/4 | 5/5 | 5/6 | 0/4 | 0/224 | 9.6 / 18.2 / 20.0 / 14.4 / 20.0° |
| 5 rejected: per-joint final allowances | 14/25 | 5/6 | 3/4 | 2/5 | 4/6 | 0/4 | 0/224 | 7.3 / 12.3 / 14.8 / 10.2 / 19.6° |
| 6 check: step 4 without orientation | 18/25 | 5/6 | 3/4 | 5/5 | 5/6 | 0/4 | 0/224 | 9.8 / 20.0 / 20.0 / 14.4 / 20.0° |

Interpretation:

* Hysteresis is the largest pure logic fix: +4 completions without changing any tolerance.
* Orientation alone lowers completion. Removing the left/right mixture tightens the
  learned spreads, which the old RMS-based allowance then made stricter. Combined with
  runtime-matched calibration it gives the same sensitivity as step 6. Without it,
  Vrikshasana's final joint multiplier is 19 (every joint at the 20° cap) instead of 2.9,
  so orientation is kept because it gives a more specific reference.
* **The gain from step 4 partly comes from wider tolerances.** Trikasana and Padamasana
  final joints now sit at the 20° cap, and Bhujasana rose from 9.5° to 14.4°. With 4–6
  performers per pose, held-out people differ from the reference by 1–3× the in-sample
  spread, and the data cannot support tighter limits that still accept new people.
* Per-joint allowances (step 5) were tighter but generalized worse. With 3–5 performers,
  each joint's allowance is the largest of a handful of values, and the next person
  deviates on different joints.
* Cross-pose completion (a pose model completing on a different asana's video) stays
  0/224. This is only a coarse false-acceptance proxy: other asanas are not deliberate
  mistakes.
* Step selection used these 25 videos, so the development numbers are optimistic.

## Test results (15 supplied test recordings, full-recording protocol)

| Pose | Supplied | Scorable | Final hold completed | Completed (scorable only) | Full movement verified | Completed but given ≥1 correction | Previous algorithm, same protocol |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tadasana | 3 | 3 | 2 | 2/3 | 0 | 1/2 | 1/3 |
| Vrikshasana | 3 | 3 | 1 | 1/3 | 0 | 1/1 | 0/3 |
| Trikasana | 3 | 3 | 3 | 3/3 | 0 | 3/3 | 2/3 |
| Bhujasana | 3 | 3 | 3 | 3/3 | 0 | 3/3 | 1/3 |
| Padamasana | 3 | 1 | 1 | 1/1 | 0 | 1/1 | 0/3 |
| **Total** | **15** | **13** | **10/15** | **10/13** | **0/15** | **9/10** | **4/15** |

Cross-pose completions on test recordings: 0/60. Attribution: the old windowed
protocol reported 0/10 scorable completions. The previous algorithm completes 4/15 when
given whole recordings, and the new algorithm completes 10/15.

Remaining failures (descriptive; nothing was changed in response):

* **Tadasana 15:** reaches the final pose, but its longest in-range run is 0.87 s before
  tracking drops (41 tracking-loss frames).
* **Vrikshasana 12 and 14:** never reach the final stage. Both raise the arms overhead
  (shoulders ~170–178°), while every Vrikshasana training reference used holds the
  hands at the chest (~28–58°). This is a variant missing from the references.
* **Padamasana 13 and 14:** unscorable; only 13% and 4% of frames have a complete
  visible side because crossed legs occlude landmarks. Development Padamasana
  completion is 0/4 and its references rest on four automatically proposed boundaries.
* Tadasana 14 completes at 1.9 s because the recording starts in the final pose. Its
  review correctly reports all seven entry sections as not observed.

## What these numbers do and do not show

* **Final-hold completion is now plausible for four poses on correct performances**:
  10 of 13 scorable test recordings, and 18 of 25 development videos. These are
  reference-match rates on correct demonstrations, not accuracy.
* **Intermediate corrections are not reliable.** Every recording is a correct
  demonstration, yet 15 of 18 completed development videos and 9 of 10 completed test
  videos still received at least one spoken correction, and 0 recordings verified the
  full movement. Those corrections are false alarms. The intermediate references come
  from approximate boundaries, 24-sample DTW alignment and 4–6 people.
* No false-acceptance rate, missed-error rate or correction accuracy can be estimated:
  there are no labeled incorrect performances. Final-pose tolerances at the 20° cap
  (Trikasana, Padamasana) cannot flag deviations smaller than 20° on a joint.
* The test set was inspected during earlier development and in this diagnosis (one
  trace and the existing report). These are development results, not a pristine benchmark.

## Data needed before claiming reliable coaching

1. **Labeled mistakes:** recordings of each pose performed with specific, annotated errors
   (e.g. bent standing knee, low arm, hips not open). Ideally 20 or more performers per
   pose, recorded by the same camera setup, to measure missed errors and false
   corrections per joint.
2. **Expert phase/boundary annotations** for entry and hold (the review tool is
   `npm run ml:review`), especially for Padamasana, whose current references use
   automatic proposals.
3. **Variant coverage:** the Vrikshasana arms-overhead variant and both sides of each
   asymmetric pose, ideally labeled.
4. **Fresh held-out performers**, never inspected during development, for a final
   unbiased evaluation; plus on-device recordings, since live 30 fps MediaPipe input
   differs from 8 fps offline extraction.

## Reproduce

```powershell
node ml/diagnose.cjs            # ablation table (training only)
node ml/diagnose.cjs --trace "test/Tadasana/video 13.mp4" --every 3
npm run ml:train:draft          # model, reports, references and demo videos
npm test; npx tsc --noEmit
```

Artifacts: `src/data/temporalModel.json` (parameters, `validation` block with these
counts, `productionReady: false`), `ml/reports/summary.json` (development and test tallies,
cross-pose rows), and `ml/reports/evaluation.json` (per-frame stage, hold, side and
out-of-tolerance joints for each test recording). Reports and caches are local and git-ignored.
