import { poses, type Illustration } from "./poses";

type Profile = { camera: "front" | "side"; cameraLabel: string; setup: string; coverage: string; manual?: boolean };
const sideSetup = "Place the camera beside your mat, level and far enough away to show your head, hands and feet. Show your side profile with your head toward the right of the preview.";
const profiles: Record<Illustration, Profile> = {
  prayer: { camera: "front", cameraLabel: "FRONT VIEW · Face the camera", setup: "Face the camera and keep your head, hands and feet in view.", coverage: "Checks standing alignment and hand placement; palm contact is not measured." },
  raised: { camera: "side", cameraLabel: "SIDE VIEW · Toes point right →", setup: "Turn sideways with toes pointing right in the preview. Leave room above and behind you for your arms.", coverage: "Checks backward direction, arms and legs; spinal curvature is not measured." },
  fold: { camera: "side", cameraLabel: "SIDE VIEW · Face right →", setup: sideSetup, coverage: "Basic checks for a forward fold, lowered hands and supported legs; hand-to-foot contact is not measured." },
  lunge: { camera: "side", cameraLabel: "SIDE VIEW · Front foot points right →", setup: sideSetup + " Keep both legs visible for the lunge check.", coverage: "Basic checks for the specified front leg, bent front knee, extended rear leg and hand placement; knee contact is not measured." },
  plank: { camera: "side", cameraLabel: "SIDE VIEW · Head toward right →", setup: sideSetup, coverage: "Basic checks for body alignment and shoulders above wrists; weight bearing is not measured." },
  salute: { camera: "side", cameraLabel: "SIDE VIEW · Head toward right →", setup: sideSetup, manual: true, coverage: "Manual guidance only. Eight-point contact and chest/chin placement cannot be verified by this detector." },
  cobra: { camera: "side", cameraLabel: "SIDE VIEW · Head toward right →", setup: sideSetup, coverage: "Basic checks for lifted chest, low hips, extended legs and hands near shoulders; mat contact and backbend depth are not measured." },
  dog: { camera: "side", cameraLabel: "SIDE VIEW · Head toward right →", setup: sideSetup, coverage: "Basic checks for an inverted V, raised hips, long arms and legs; heel contact is not measured." },
};

export const PRACTICE_POSES = poses.map(pose => ({
  ...pose,
  ...profiles[pose.family],
  guideLabel: pose.family === "raised" ? "Reference photo" : "Schematic pose guide",
  frontLeg: pose.family === "lunge" ? (pose.id === 4 ? "left" : "right") as "left" | "right" : undefined,
  instruction: pose.family === "prayer" ? "Face the camera. Stand tall and bring your hands together at your chest."
    : pose.family === "raised" ? "Turn sideways with toes pointing right in the preview. Raise both arms alongside your ears and lift your chest into a comfortable backward arch. Do not force the depth shown."
    : pose.keyPoints.join(" "),
}));
