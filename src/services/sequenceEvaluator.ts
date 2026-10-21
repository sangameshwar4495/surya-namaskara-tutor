import type { PoseDetectionResult } from "../types/pose";
import type { Evaluation } from "./practiceEvaluator";
import { PRACTICE_POSES } from "../data/practicePoses";
import { checkSideInFrame, reliablePoint, visibleSide } from "./sideTracking";

const fail = (message: string, kind: "posture" | "tracking" = "posture"): Evaluation => ({ ready: false, kind, message });

/** Initial geometric rules, not validated anatomical or contact assessments. */
export function evaluateSequencePose(result: PoseDetectionResult, index: number, accepted: boolean): Evaluation {
  const pose = PRACTICE_POSES[index];
  if (pose.manual) return { ready: false, kind: "manual", message: pose.coverage };
  const framing = checkSideInFrame(result.landmarks);
  if (!framing.inFrame) return fail(framing.message, "tracking");
  const p = result.landmarks;
  const s = visibleSide(p)!;
  const sh = p[s.shoulder], hip = p[s.hip], knee = p[s.knee], ankle = p[s.ankle], wrist = p[s.wrist];
  const a = result.angles;
  const angles = s.name === "left" ? { knee: a.leftKnee, hip: a.leftHip, elbow: a.leftElbow, shoulder: a.leftShoulder }
    : { knee: a.rightKnee, hip: a.rightHip, elbow: a.rightElbow, shoulder: a.rightShoulder };
  if (Object.values(angles).some(v => v === null || !Number.isFinite(v))) return fail("Keep your camera-facing joints clearly visible", "tracking");
  const distance = (u: typeof sh, v: typeof sh) => Math.hypot(u.x - v.x, u.y - v.y);
  const torso = distance(sh, hip);
  if (torso < 0.08) return fail("Move closer while keeping your whole body visible", "tracking");
  if (reliablePoint(p[11]) && reliablePoint(p[12]) && Math.abs(p[11].x - p[12].x) > torso * 0.55) return fail("Turn sideways so the camera can see your profile");
  const slack = accepted ? 3 : 0;
  if (sh.x < hip.x - torso * 0.1) return fail("Turn so your head is toward the right of the preview");

  switch (pose.family) {
    case "fold":
      if (angles.hip! > 85 + slack || sh.y < hip.y + torso * 0.35) return fail("Fold forward from your hips and lower your torso");
      if (angles.knee! < 140 - slack) return fail("Keep your hips lifted; ease out of the squat");
      if (wrist.y < knee.y - torso * 0.15) return fail("Lower your hands toward your shins or feet");
      if (ankle.y < hip.y + torso * 0.5) return fail("Stand on your feet with your hips above your legs");
      break;
    case "lunge": {
      if (![23,24,25,26,27,28].every(i => reliablePoint(p[i]))) return fail("Show both legs so the front and rear leg can be checked", "tracking");
      const leftFront = pose.frontLeg === "left";
      const front = p[leftFront ? 25 : 26], frontAnkle = p[leftFront ? 27 : 28];
      const rear = p[leftFront ? 26 : 25], rearAnkle = p[leftFront ? 28 : 27];
      const frontAngle = leftFront ? a.leftKnee : a.rightKnee;
      const rearHip = leftFront ? a.rightHip : a.leftHip;
      if (frontAngle === null || rearHip === null || !Number.isFinite(frontAngle) || !Number.isFinite(rearHip)) return fail("Keep both legs clearly tracked", "tracking");
      if (frontAnkle.x - rearAnkle.x < torso * 1.2 || front.x - rear.x < torso * 0.6) return fail(`Bring your ${pose.frontLeg} foot forward and extend the other leg back`);
      if (frontAngle < 65 - slack || frontAngle > 120 + slack || Math.abs(front.x - frontAnkle.x) > torso * 0.4) return fail("Bend your front knee above the ankle");
      if (rearHip < 135 - slack) return fail("Lengthen your rear leg behind you");
      if (sh.y > hip.y - torso * 0.3) return fail("Lift your chest above your hips");
      if (wrist.y < front.y || Math.abs(wrist.x - frontAnkle.x) > torso * 0.8) return fail("Place your hands beside your front foot");
      break;
    }
    case "plank":
      if (angles.hip! < 160 - slack || angles.knee! < 155 - slack) return fail("Lengthen your body from shoulders through hips to heels");
      if (Math.abs(sh.y - ankle.y) > Math.abs(sh.x - ankle.x) * 0.5 || sh.x - ankle.x < torso) return fail("Extend into a long plank, facing the right of the preview");
      if (angles.elbow! < 155 - slack || wrist.y < sh.y + torso * 0.4 || Math.abs(wrist.x - sh.x) > torso * 0.35) return fail("Place your shoulders above your wrists and lengthen your arms");
      break;
    case "cobra":
      if (sh.y > hip.y - torso * 0.4) return fail("Lift your chest while keeping your hips low");
      if (hip.x - ankle.x < torso * 0.6 || Math.abs(hip.y - ankle.y) > torso * 0.35 || angles.knee! < 150 - slack) return fail("Extend your legs behind you and lower your hips toward the mat");
      if (wrist.y < hip.y - torso * 0.2 || Math.abs(wrist.x - sh.x) > torso * 0.6) return fail("Bring your hands beside your chest");
      break;
    case "dog":
      if (hip.y > Math.min(sh.y, ankle.y) - torso * 0.45 || hip.x < ankle.x || hip.x > wrist.x) return fail("Lift your hips up and back into an inverted V");
      if (angles.hip! > 110 + slack || angles.hip! < 35 - slack) return fail("Lengthen both sides of the inverted V");
      if (angles.knee! < 145 - slack || angles.elbow! < 150 - slack || angles.shoulder! < 145 - slack) return fail("Lengthen your arms and legs while keeping your hips lifted");
      if (wrist.y < sh.y + torso * 0.3 || Math.abs(wrist.y - ankle.y) > torso * 0.4) return fail("Keep your hands and feet toward the mat");
      break;
    default: return fail("Correction rules unavailable for this pose", "tracking");
  }
  return { ready: true, kind: "ready", message: "Basic position checks passed — hold and breathe" };
}
