import type { ImageSourcePropType } from "react-native";

export type Illustration = "prayer" | "raised" | "fold" | "lunge" | "plank" | "salute" | "cobra" | "dog";
export type PoseMediaSource =
  | { kind: "illustration"; illustration: Illustration }
  | { kind: "image"; source: ImageSourcePropType };

export interface DemoPose {
  id: number;
  name: string;
  subtitle: string;
  keyPoints: readonly string[];
  /** Planned demonstration length, in seconds. */
  duration: number;
  media: PoseMediaSource;
}

export const poses: readonly DemoPose[] = [
  { id: 1, name: "Pranamasana", subtitle: "Prayer Pose", duration: 15, media: { kind: "illustration", illustration: "prayer" }, keyPoints: ["Stand tall with feet together.", "Join your palms at the chest.", "Keep your spine straight.", "Relax your shoulders and breathe normally."] },
  { id: 2, name: "Hasta Uttanasana", subtitle: "Raised Arms Pose", duration: 15, media: { kind: "illustration", illustration: "raised" }, keyPoints: ["Inhale as you raise your arms overhead.", "Lengthen through your fingertips.", "Lift your chest into a gentle backbend.", "Keep your knees soft and avoid compressing your lower back."] },
  { id: 3, name: "Padahastasana", subtitle: "Standing Forward Bend", duration: 15, media: { kind: "illustration", illustration: "fold" }, keyPoints: ["Exhale and fold forward from your hips.", "Bend your knees as much as needed.", "Let your hands rest beside your feet or on your shins.", "Relax your neck without forcing the stretch."] },
  { id: 4, name: "Ashwa Sanchalanasana", subtitle: "Equestrian Pose", duration: 15, media: { kind: "illustration", illustration: "lunge" }, keyPoints: ["Inhale and step your right foot back.", "Lower your right knee gently to the mat.", "Keep your left knee above your ankle.", "Lift your chest and look gently forward."] },
  { id: 5, name: "Dandasana", subtitle: "Plank Pose", duration: 15, media: { kind: "illustration", illustration: "plank" }, keyPoints: ["Step your left foot back beside the right.", "Place your shoulders above your wrists.", "Keep your body in one long line.", "Engage your abdomen and breathe steadily."] },
  { id: 6, name: "Ashtanga Namaskara", subtitle: "Eight-Point Salute", duration: 15, media: { kind: "illustration", illustration: "salute" }, keyPoints: ["Lower your knees to the mat first.", "Exhale and lower your chest and chin gently.", "Keep your elbows close to your body.", "Keep your hips slightly lifted and avoid straining your neck."] },
  { id: 7, name: "Bhujangasana", subtitle: "Cobra Pose", duration: 15, media: { kind: "illustration", illustration: "cobra" }, keyPoints: ["Slide forward with your hips resting on the mat.", "Place your palms beside your chest.", "Inhale and gently lift your chest, keeping elbows bent.", "Draw your shoulders away from your ears."] },
  { id: 8, name: "Adho Mukha Svanasana", subtitle: "Downward-Facing Dog", duration: 15, media: { kind: "illustration", illustration: "dog" }, keyPoints: ["Exhale and lift your hips up and back.", "Press evenly through your palms.", "Lengthen your spine and soften your knees if needed.", "Let your heels move toward the mat without forcing them."] },
  { id: 9, name: "Ashwa Sanchalanasana", subtitle: "Equestrian Pose", duration: 15, media: { kind: "illustration", illustration: "lunge" }, keyPoints: ["Inhale and step your right foot between your hands.", "Lower your left knee gently to the mat.", "Keep your right knee above your ankle.", "Lift your chest and look gently forward."] },
  { id: 10, name: "Padahastasana", subtitle: "Standing Forward Bend", duration: 15, media: { kind: "illustration", illustration: "fold" }, keyPoints: ["Step your left foot forward beside your right.", "Exhale and fold from your hips.", "Keep your knees softly bent as needed.", "Release tension in your neck and shoulders."] },
  { id: 11, name: "Hasta Uttanasana", subtitle: "Raised Arms Pose", duration: 15, media: { kind: "illustration", illustration: "raised" }, keyPoints: ["Inhale and rise with a long spine.", "Sweep your arms overhead.", "Lift your chest into a gentle backbend.", "Keep your weight balanced through both feet."] },
  { id: 12, name: "Pranamasana", subtitle: "Prayer Pose", duration: 15, media: { kind: "illustration", illustration: "prayer" }, keyPoints: ["Exhale and return to standing tall.", "Bring your palms together at your chest.", "Relax your shoulders and soften your gaze.", "Breathe normally to complete the sequence."] },
];
