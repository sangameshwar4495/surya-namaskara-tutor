import type { ReactNode } from "react";
import { Feather } from "@expo/vector-icons";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { PoseMediaSource } from "../../data/poses";
import PoseIllustration from "./PoseIllustration";
import { colors, demoStyles } from "./styles";

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// A future video/GIF/animation renderer can occupy the same visual slot and
// supply playback state without changing the surrounding screen.
export default function PoseMedia({ media, name, duration, visual, currentTime = 0, playing = false, onTogglePlayback }: {
  media: PoseMediaSource; name: string; duration: number; visual?: ReactNode;
  currentTime?: number; playing?: boolean; onTogglePlayback?: () => void;
}) {
  const elapsed = Math.max(0, Math.min(currentTime, duration));
  return <View style={[demoStyles.card, styles.card]}>
    <View style={styles.visual} accessibilityLabel={`${name} illustration`}>
      {visual ?? (media.kind === "image" ? <Image source={media.source} style={styles.image} resizeMode="contain" accessibilityLabel={name} /> : <PoseIllustration illustration={media.illustration} />)}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={onTogglePlayback ? (playing ? "Pause demonstration" : "Play demonstration") : "Playback unavailable — illustration preview"} accessibilityState={{ disabled: !onTogglePlayback }} disabled={!onTogglePlayback} onPress={onTogglePlayback} style={styles.play}>
        <Feather name={playing ? "pause" : "play"} size={26} color={colors.white} />
      </TouchableOpacity>
    </View>
    {!onTogglePlayback && <Text style={styles.note}>Illustration preview · video coming soon</Text>}
    <View style={styles.track}><View style={[styles.fill, { width: `${duration > 0 ? elapsed / duration * 100 : 0}%` }]} /></View>
    <View style={styles.times}><Text style={styles.time}>{time(elapsed)}</Text><Text style={styles.time}>{time(duration)}</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 18, gap: 12 },
  visual: { aspectRatio: 1.25, backgroundColor: "#EEF3EE", borderRadius: 22, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  play: { position: "absolute", backgroundColor: colors.primary, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", opacity: 0.85 },
  note: { color: colors.muted, fontSize: 12, textAlign: "center" },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.pale, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.primary },
  times: { flexDirection: "row", justifyContent: "space-between" },
  time: { color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] },
});
