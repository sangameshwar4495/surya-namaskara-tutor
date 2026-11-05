// Diagnostics for the learned-practice evaluator.
//
//   node ml/diagnose.cjs                 ablation on TRAINING videos only (no test data read)
//   node ml/diagnose.cjs --trace "test/Tadasana/video 13.mp4" [--every 3]
//                                        frame-by-frame trace through the exported model
//
// Ablation rows apply the fixes cumulatively so each one's contribution is visible. Each row
// uses nested leave-one-video-out: the held-out recording never influences its own model or
// thresholds. Cross-pose completion (a pose model completing on a different asana) is a crude
// false-acceptance proxy because no deliberately incorrect performances are available.
const fs = require('node:fs');
const path = require('node:path');
const P = require('./pipeline.cjs');
const { jointTolerance } = require('../src/services/temporalPose.ts');

const data = path.resolve('ml/data');
const manifest = JSON.parse(fs.readFileSync(path.join(data, 'manifest.json')));
const fullFrames = r => JSON.parse(fs.readFileSync(path.join(data, `${r.sha256}.json`))).frames;
const args = process.argv.slice(2);

if (args.includes('--trace')) {
  const target = args[args.indexOf('--trace') + 1];
  const every = Number(args.includes('--every') ? args[args.indexOf('--every') + 1] : 1);
  const record = manifest.find(r => r.path === target);
  if (!record) throw Error(`Unknown clip ${target}`);
  const model = JSON.parse(fs.readFileSync('src/data/temporalModel.json'));
  const pose = model.poses.find(p => p.name === record.pose);
  const frames = fullFrames(record);
  const { outputs, completedAtMs } = P.simulate(pose, frames);
  console.log(`${target}: ${frames.length} frames, ${(frames.at(-1).t / 1000).toFixed(1)} s, ${pose.phases.length} stages, ` +
    `complete-side coverage ${(P.coverage(frames) * 100).toFixed(0)}%, completed at ${completedAtMs ?? 'never'}`);
  console.log('time  visible  stage status   held  side  out-of-tolerance joints (signed/tolerance)');
  outputs.forEach((o, i) => {
    if (i % every && o.status !== 'complete') return;
    const visible = frames[i].angles.map(a => a === null ? '.' : '#').join('');
    const out = o.jointErrors.filter(e => e.outsideTolerance).map(e => `${e.joint}${e.signedDegrees > 0 ? '+' : ''}${e.signedDegrees.toFixed(0)}/${e.tolerance.toFixed(0)}`).join(' ');
    console.log(`${(o.t / 1000).toFixed(1).padStart(5)} ${visible} ${String(o.phase + 1).padStart(3)}/${o.total} ${o.status.padEnd(8)} ${String(Math.round(o.heldMs)).padStart(5)} ${o.mirrored ? 'mirr' : 'asis'}  ${out}`);
  });
  process.exit(0);
}

const training = manifest.filter(r => r.split === 'train' && r.useForTraining !== false && r.correct !== false)
  .map(r => { try { return P.prepare(r, data, true); } catch { return null; } }).filter(Boolean);
const negatives = manifest.filter(r => r.split === 'train'); // other-pose training videos only
const legacyPractice = { mirror: false, holdHysteresis: false, holdGraceMs: 0 };
const legacyTraining = { orient: false, frameCalibration: false, jointAllowance: false };
const steps = [
  ['0 baseline (previous algorithm)', legacyTraining, legacyPractice],
  ['1 + final-hold hysteresis', legacyTraining, { ...legacyPractice, holdHysteresis: true }],
  ['2 + 250 ms noise grace', legacyTraining, { ...legacyPractice, holdHysteresis: true, holdGraceMs: 250 }],
  ['3 + side orientation (train+runtime)', { ...legacyTraining, orient: true }, { mirror: true, holdHysteresis: true, holdGraceMs: 250 }],
  ['4 + runtime-matched calibration (final)', {}, {}],
  ['5 (rejected) + per-joint final allowance', { jointAllowance: true }, {}],
  ['6 (check) final without orientation', { orient: false }, { mirror: false }],
];
// Mean final-pose joint allowance in degrees: lower = more able to flag a deviation.
const finalTolerance = pose => { const p = pose.phases.at(-1); const t = p.mean.flatMap((v, i) => v === null ? [] : [jointTolerance(p, i)]); return t.reduce((s, v) => s + v, 0) / t.length; };
const only = args.find(a => /^\d$/.test(a));
console.log(`Training videos used: ${training.length}. Test data is not read in this mode.\n`);
for (const [label, trainOptions, practiceOptions] of steps) {
  if (only && !label.startsWith(only)) continue;
  const rows = P.leaveOneVideoOut(training, fullFrames, { trainOptions, practiceOptions });
  const models = P.SEQUENCE.map(name => P.train(training.filter(c => c.record.pose === name), trainOptions));
  const cross = P.crossPose(models, negatives, fullFrames, practiceOptions);
  const byPose = P.tally(rows);
  const cells = P.SEQUENCE.map(n => `${n.slice(0, 5)} ${byPose[n].complete}/${byPose[n].n}`).join('  ');
  console.log(`${label.padEnd(40)} held-out complete ${rows.filter(r => r.complete).length}/${rows.length} ` +
    `(verified ${rows.filter(r => r.verified).length})  | ${cells} | cross-pose ${cross.filter(r => r.complete).length}/${cross.length}`);
  console.log(`${''.padEnd(40)} mean final-pose tolerance: ${models.map(m => `${m.name.slice(0, 5)} ${finalTolerance(m).toFixed(1)}°`).join('  ')}`);
  if (args.includes('--rows')) {
    rows.forEach(r => console.log(`    ${r.path.padEnd(32)} ${r.complete ? `complete at ${(r.completedAtMs / 1000).toFixed(1)} s` : 'not completed'}`));
    cross.filter(r => r.complete).forEach(r => console.log(`    cross: ${r.model} model completed on ${r.path} at ${(r.completedAtMs / 1000).toFixed(1)} s`));
  }
}
