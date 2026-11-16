/**
 * Poses offered for demos and practice, in display order. Names match the trained model
 * (`temporalModel.json`) and the generated demo clips (`datasetDemos.ts`). The model also contains
 * Padamasana, which the app intentionally does not offer.
 *
 * Key points and cautions are quoted from the Government of India Common Yoga Protocol (below),
 * only lightly edited for grammar and with diacritics removed. Steps the bundled demonstration
 * clips do not show are left out (noted per pose) so that the text never contradicts the video.
 */
export const KEY_POINT_SOURCE = {
  title: 'Common Yoga Protocol',
  publisher: 'Ministry of AYUSH, Government of India',
  edition: '4th revised edition, May 2019',
};

export const MOVEMENT_POSES = [
  {
    name: 'Tadasana', subtitle: 'Palm Tree Posture', sourceName: 'Tāḍāsana', sourcePages: 'p. 15',
    // Omitted: rising onto the toes. The demonstrator keeps the heels down.
    keyPoints: [
      'Stand with feet 2 inches apart.',
      'Inhale, lift your arms up to the shoulder level in the front.',
      'Interlock the fingers, and turn the wrist outwards.',
      'Now inhale, raise the arms up above your head.',
      'Stay in this position for 10-30 seconds.',
      'Exhale, release the interlock of the fingers and bring the arms down and come back to standing posture.',
    ],
    cautions: [],
  },
  {
    name: 'Vrikshasana', subtitle: 'Tree Posture', sourceName: 'Vṛkṣāsana', sourcePages: 'pp. 15–16',
    // Shortened: the protocol extends the joined palms overhead; the demonstrator, like every
    // training reference, keeps them at the chest. Omitted: heel touching the perineum region.
    keyPoints: [
      'Stand with feet 2 inches apart.',
      'Focus on a point in front.',
      'Exhale, hold and bend the right leg, then place the foot on the inner side of the left thigh.',
      'Join the palms together for Namaskar Mudra.',
      'Stay in the position for 10 to 30 seconds and breathe normally.',
      'Repeat this asana from the left side also.',
    ],
    cautions: ['Please avoid this practice in case of arthritis or vertigo.'],
  },
  {
    name: 'Trikasana', subtitle: 'Triangle Posture', sourceName: 'Trikoṇāsana', sourcePages: 'p. 18',
    // Omitted: turning the left palm forward and gazing at the left middle finger.
    keyPoints: [
      'Stand with your feet 3 feet apart.',
      'Inhale, slowly raise both the arms sideways up to shoulder level.',
      'Turn the right foot towards the right side.',
      'Exhale, slowly bend to the right side and place the right hand fingers just behind the right foot.',
      'Keep the left arm straight, in line with the right arm.',
      'Remain in the posture for 10-30 seconds with normal breathing.',
      'Inhale, slowly come up. Repeat the same procedure from the left side.',
    ],
    cautions: [
      'Avoid this posture in case of slipped disc, sciatica, and after undergoing abdominal surgery.',
      'Do not try beyond limits and overdo the lateral stretch.',
      'If one cannot touch the feet, one can reach for the knees instead.',
    ],
  },
  {
    name: 'Bhujasana', subtitle: 'Cobra Posture', sourceName: 'Bhujaṅgāsana', sourcePages: 'pp. 27–28',
    // The full Bhujangasana steps; the protocol's preliminary Sarala Bhujangasana is omitted.
    keyPoints: [
      'Lie down on your stomach, rest your head on your hands and relax the body.',
      'Now join your legs and stretch your arms.',
      'Keep your palms beside the chest and raise your elbows where they are.',
      'Inhale, slowly lift the head and chest up to the navel region.',
      'Keep the elbows parallel and maintain the posture for 10-30 seconds with normal breathing.',
      'Keep the legs firm so that no load or strain is felt on the lumbar spine.',
      'Exhale, rest your forehead on the ground and relax.',
    ],
    cautions: [
      'Those who have undergone abdominal surgery should avoid this asana for 2-3 months.',
      'Those who suffer from hernia or ulcers should not practice this asana.',
    ],
  },
] as const;

export type MovementPoseName = (typeof MOVEMENT_POSES)[number]['name'];

export function findMovementPose(name: unknown) {
  return MOVEMENT_POSES.find(pose => pose.name === name);
}

/** Narration for a pose demo. Ranges are spoken as "10 to 30" rather than "10 minus 30". */
export function keyPointNarration(pose: (typeof MOVEMENT_POSES)[number]): string {
  const say = (text: string) => text.replace(/(\d+)\s*-\s*(\d+)/g, '$1 to $2');
  return [`${pose.name}, the ${pose.subtitle}.`, 'Key points.', ...pose.keyPoints.map(say)].join(' ');
}
