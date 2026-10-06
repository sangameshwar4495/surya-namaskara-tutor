import Svg, { Circle, Path, Ellipse } from "react-native-svg";
import type { Illustration } from "../../data/poses";
import { colors } from "./styles";

// Schematic placeholders, replaceable with finished pose media in poses.ts.
const figures: Record<Illustration, { head: [number, number]; body: string }> = {
  prayer: { head: [100, 35], body: "M100 52 L100 112 M100 62 L76 82 L100 73 L124 82 L100 62 M100 112 L87 170 M100 112 L113 170" },
  raised: { head: [91, 38], body: "M96 54 Q112 80 104 113 M99 65 L76 40 L71 16 M99 65 L110 39 L101 14 M104 113 L89 170 M104 113 L117 170" },
  fold: { head: [123, 135], body: "M99 90 Q128 90 128 119 M99 90 L88 170 M99 90 L106 170 M128 116 L140 168 M128 116 L119 168" },
  lunge: { head: [119, 59], body: "M115 76 L98 113 M112 83 L134 144 M98 113 L133 114 L147 168 M98 113 L66 151 L32 163" },
  plank: { head: [148, 87], body: "M133 97 L75 118 L30 154 M130 100 L140 164 M122 103 L123 164" },
  salute: { head: [152, 146], body: "M138 148 L111 132 L83 148 L49 151 L28 163 M135 146 L125 123 L155 164" },
  cobra: { head: [143, 76], body: "M137 93 Q127 150 85 156 L28 160 M133 104 L119 127 L144 163 M85 156 L54 168 L27 168" },
  dog: { head: [139, 125], body: "M132 113 L101 64 L62 115 L33 168 M101 64 L77 124 L56 168 M132 113 L164 168 M123 101 L147 168" },
};
export default function PoseIllustration({ illustration }: { illustration: Illustration }) {
  const figure = figures[illustration];
  return <Svg width="100%" height="100%" viewBox="0 0 200 190" accessible={false}>
    <Ellipse cx="100" cy="174" rx="80" ry="6" fill={colors.pale} />
    <Path d={figure.body} stroke={colors.primary} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Circle cx={figure.head[0]} cy={figure.head[1]} r="12" fill={colors.accent} />
  </Svg>;
}
