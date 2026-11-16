const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(output, filename);
};
const { MOVEMENT_POSES, findMovementPose } = require('../src/data/movementPoses.ts');
const { MOVEMENT_SETUP } = require('../src/services/learnedGuidance.ts');
const model = require('../src/data/temporalModel.json');
const root = path.join(__dirname, '..');
const NAMES = ['Tadasana', 'Vrikshasana', 'Trikasana', 'Bhujasana'];

test('demos and movement practice offer exactly the four poses, without Padamasana', () => {
  assert.deepEqual(MOVEMENT_POSES.map(p => p.name), NAMES);
  assert.equal(findMovementPose('Padamasana'), undefined);
  assert.equal(findMovementPose(undefined), undefined);
  assert.equal(findMovementPose('Bhujasana').name, 'Bhujasana');
  assert.ok(!('Padamasana' in MOVEMENT_SETUP));
  for (const pose of MOVEMENT_POSES) assert.ok(pose.subtitle && pose.keyPoints.length > 0, pose.name);
});

test('every offered pose has a trained model entry and setup guidance', () => {
  for (const name of NAMES) {
    assert.ok(model.poses.some(p => p.name === name), `${name} missing from temporalModel.json`);
    assert.ok(MOVEMENT_SETUP[name], `${name} missing setup text`);
  }
});

test('every offered pose maps to its own bundled demonstration clip', () => {
  // datasetDemos.ts requires .mp4 files, so read its mapping as text instead of loading it.
  const source = fs.readFileSync(path.join(root, 'src/data/datasetDemos.ts'), 'utf8');
  for (const name of NAMES) {
    const match = source.match(new RegExp(`"${name}": \\{source: require\\('\\.\\./\\.\\./(assets/demos/[^']+)'\\)`));
    assert.ok(match, `${name} has no demo entry`);
    assert.equal(match[1], `assets/demos/${name}.mp4`);
    assert.ok(fs.statSync(path.join(root, match[1])).size > 0, `${match[1]} is empty`);
  }
});

test('demo key points cite the Common Yoga Protocol and narrate ranges naturally', () => {
  const { KEY_POINT_SOURCE, keyPointNarration } = require('../src/data/movementPoses.ts');
  assert.match(KEY_POINT_SOURCE.publisher, /Ministry of AYUSH/);
  for (const pose of MOVEMENT_POSES) {
    assert.ok(pose.sourceName && /^pp?\. \d/.test(pose.sourcePages), `${pose.name} lacks a source reference`);
    const spoken = keyPointNarration(pose);
    assert.ok(spoken.startsWith(`${pose.name}, the ${pose.subtitle}.`));
    for (const point of pose.keyPoints) assert.ok(spoken.includes(point.replace(/(\d+)\s*-\s*(\d+)/g, '$1 to $2')));
    assert.doesNotMatch(spoken, /\d-\d/, 'ranges such as 10-30 must be spoken as "10 to 30"');
  }
});

test('user-facing practice screens carry no pose counts, tags or disclaimers', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const screens = ['app/practice-mode.tsx', 'app/movement-practice.tsx', 'app/dataset-practice.native.tsx', 'app/demo/index.tsx', 'app/demo/pose.tsx'].map(read).join('\n');
  assert.match(read('app/practice-mode.tsx'), /title="Practice yoga poses"/);
  assert.doesNotMatch(screens, /Learned movement practice|EXPERIMENTAL|4 POSES|badge=|not medical advice|\bfour\b/i);
});
