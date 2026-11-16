// Diagnostics for the learned-practice evaluator.
//
//   node ml/diagnose.cjs                 ablation on TRAINING videos only (no test data read)
//   node ml/diagnose.cjs --mistakes [--rows]
//                                        injected in-between mistakes on held-out TRAINING videos
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
const { FEATURES, jointTolerance } = require('../src/services/temporalPose.ts');

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


// --- Synthetic-mistake benchmark (training videos only) ---
//   node ml/diagnose.cjs --mistakes
// No recordings of incorrect performances exist yet, so typical in-between mistakes are injected
// into correct held-out recordings, in the middle half of the entry movement. It shows whether a
// version can catch such mistakes at all; it is NOT a measured accuracy on real mistakes.
function mistakesBenchmark(training) {
  const BODY = { Knee: 'knee', Elbow: 'elbow', Shoulder: 'upper arm', Hip: 'hip' };
  const bend = (part, by) => ({ name: `${BODY[part].replace('upper arm', 'arm')}s bent ${by} deg`, word: BODY[part],
    apply: (angles) => angles.map((v, k) => v !== null && FEATURES[k].endsWith(part) ? Math.max(0, v - by) : v) });
  const mistakes = [bend('Knee', 45), bend('Elbow', 50), bend('Hip', 40),
    // Part-way back toward the start, then on: a full return is a restart and is not flagged.
    { name: 'moves part-way back mid-way', word: null, back: true }];
  const configs = [
    ['previous strict (nearest stage, 20 deg cap)', { pathTolerance: false, learnedTolerance: false, jointRoles: false, pathCoverage: false }],
    ['previous lenient (uncapped learned tolerance)', { learnedTolerance: true, jointRoles: false }],
    ['option 2 only (capped learned path)', { jointRoles: false }],
    ['new default (path + learned joint roles)', {}],
  ];
  const offered = P.SEQUENCE.filter(n => n !== 'Padamasana');
  const held = [];
  for (const name of offered) {
    const group = training.filter(c => c.record.pose === name);
    group.forEach((clip, i) => held.push({ name, clip, pose: P.train(group.filter((_, j) => j !== i)) }));
  }
  for (const [label, options] of configs) {
    let clean = 0, correct = 0, falseCorrections = 0;
    const caught = mistakes.map(() => ({ n: 0, caught: 0, byPose: {} }));
    for (const { name, clip, pose } of held) {
      const frames = fullFrames(clip.record);
      const run = P.simulate(pose, frames, options).completed?.summary;
      if (run) { clean++; if (run.correct) correct++; if (run.corrections.length) falseCorrections++; }
      const { startMs, finalMs } = clip.boundaries, entry = finalMs - startMs;
      const startPose = frames.filter(f => f.t >= startMs).find(f => f.angles.some(v => v !== null))?.angles;
      // Reversal: from mid-entry, each joint moves 60% of its progress so far back toward the start
      // over 20% of the entry, stays there for 20%, then the real movement continues.
      const turn = startMs + entry * .5, mid = frames.reduce((a, b) => Math.abs(b.t - turn) < Math.abs(a.t - turn) ? b : a).angles;
      const reversed = f => f.angles.map((v, k) => v === null || startPose?.[k] == null || mid[k] == null ? v
        : mid[k] - .6 * (mid[k] - startPose[k]) * Math.min(1, (f.t - turn) / (entry * .2)));
      mistakes.forEach((m, j) => {
        const [from, to] = m.back ? [turn, startMs + entry * .9] : [startMs + entry * .25, startMs + entry * .75];
        const changed = frames.map(f => f.t < from || f.t > to ? f : { ...f, angles: m.back ? reversed(f) : m.apply(f.angles) });
        const s = P.simulate(pose, changed, options).completed?.summary;
        caught[j].n++;
        const cell = caught[j].byPose[name] ??= [0, 0];
        cell[1]++;
        // Caught: the review does not call it correct AND names the affected body part.
        if (s && !s.correct && (m.word === null ? s.corrections.length > 0 : s.corrections.some(c => c.includes(m.word)))) { caught[j].caught++; cell[0]++; }
      });
    }
    console.log(`${label.padEnd(46)} clean: judged correct ${correct}/${clean}, falsely corrected ${falseCorrections}/${clean} | caught: ` +
      mistakes.map((m, j) => `${m.name} ${caught[j].caught}/${caught[j].n}`).join(', '));
    if (args.includes('--rows')) mistakes.forEach((m, j) => console.log(`    ${m.name.padEnd(32)} ` +
      Object.entries(caught[j].byPose).map(([n, [c, t]]) => `${n.slice(0, 5)} ${c}/${t}`).join('  ')));
  }
}
const training = manifest.filter(r => r.split === 'train' && r.useForTraining !== false && r.correct !== false)
  .map(r => { try { return P.prepare(r, data, true); } catch { return null; } }).filter(Boolean);
const negatives = manifest.filter(r => r.split === 'train'); // other-pose training videos only
// Rows 0-6 predate learned-path scoring of in-between movement; they switch it off explicitly.
const nearestStage = { pathTolerance: false, learnedTolerance: false, jointRoles: false, pathCoverage: false };
const legacyPractice = { mirror: false, holdHysteresis: false, holdGraceMs: 0, ...nearestStage };
const legacyTraining = { orient: false, frameCalibration: false, jointAllowance: false };
const steps = [
  ['0 baseline (previous algorithm)', legacyTraining, legacyPractice],
  ['1 + final-hold hysteresis', legacyTraining, { ...legacyPractice, holdHysteresis: true }],
  ['2 + 250 ms noise grace', legacyTraining, { ...legacyPractice, holdHysteresis: true, holdGraceMs: 250 }],
  ['3 + side orientation (train+runtime)', { ...legacyTraining, orient: true }, { mirror: true, holdHysteresis: true, holdGraceMs: 250, ...nearestStage }],
  ['4 + runtime-matched calibration', {}, nearestStage],
  ['5 (rejected) + per-joint final allowance', { jointAllowance: true }, nearestStage],
  ['6 (check) step 4 without orientation', { orient: false }, { mirror: false, ...nearestStage }],
  // Rows 7-9 (2026-11-09) were REJECTED: uncapped in-between tolerance let almost anything pass.
  ['7 (rejected) + learned in-between tolerance', {}, { pathTolerance: false, pathCoverage: false, learnedTolerance: true, jointRoles: false }],
  ['8 (rejected) + whole learned path', {}, { pathCoverage: false, learnedTolerance: true, jointRoles: false }],
  ['9 (rejected) + path coverage', {}, { learnedTolerance: true, jointRoles: false }],
  ['10 capped learned path + coverage', {}, { jointRoles: false }],
  ['11 + learned joint roles (final)', {}, {}],
];
// Mean final-pose joint allowance in degrees: lower = more able to flag a deviation.
const finalTolerance = pose => { const p = pose.phases.at(-1); const t = p.mean.flatMap((v, i) => v === null ? [] : [jointTolerance(p, i)]); return t.reduce((s, v) => s + v, 0) / t.length; };
if (args.includes('--mistakes')) { mistakesBenchmark(training); process.exit(0); }
const only = args.find(a => /^\d+$/.test(a));
console.log(`Training videos used: ${training.length}. Test data is not read in this mode.\n`);
for (const [label, trainOptions, practiceOptions] of steps) {
  if (only && label.split(' ')[0] !== only) continue;
  const rows = P.leaveOneVideoOut(training, fullFrames, { trainOptions, practiceOptions });
  const models = P.SEQUENCE.map(name => P.train(training.filter(c => c.record.pose === name), trainOptions));
  const cross = P.crossPose(models, negatives, fullFrames, practiceOptions);
  const byPose = P.tally(rows);
  const cells = P.SEQUENCE.map(n => `${n.slice(0, 5)} ${byPose[n].complete}/${byPose[n].n}`).join('  ');
  console.log(`${label.padEnd(40)} held-out complete ${rows.filter(r => r.complete).length}/${rows.length} ` +
    `(correct ${rows.filter(r => r.correct).length}, verified ${rows.filter(r => r.verified).length}, ` +
    `with false corrections ${rows.filter(r => r.complete && r.corrections > 0).length})  | ${cells} | cross-pose ${cross.filter(r => r.complete).length}/${cross.length}`);
  console.log(`${''.padEnd(40)} mean final-pose tolerance: ${models.map(m => `${m.name.slice(0, 5)} ${finalTolerance(m).toFixed(1)}°`).join('  ')}`);
  if (args.includes('--rows')) {
    rows.forEach(r => console.log(`    ${r.path.padEnd(32)} ${r.complete ? `complete at ${(r.completedAtMs / 1000).toFixed(1)} s` : 'not completed'}`));
    cross.filter(r => r.complete).forEach(r => console.log(`    cross: ${r.model} model completed on ${r.path} at ${(r.completedAtMs / 1000).toFixed(1)} s`));
  }
}
