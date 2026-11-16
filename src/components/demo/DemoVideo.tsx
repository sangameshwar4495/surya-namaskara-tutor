import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import PoseMedia from "./PoseMedia";
import { colors } from "./styles";

/** Looping, muted demonstration clip that starts playing when opened. Mount with a `key` per pose. */
export default function DemoVideo({ source, name, durationMs, aspectRatio }: { source: number; name: string; durationMs: number; aspectRatio: number }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);
  const player = useVideoPlayer(source, p => {
    p.loop = true; p.muted = true; p.audioMixingMode = "mixWithOthers"; p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  useEffect(() => {
    const subscriptions = [
      player.addListener("playingChange", event => setPlaying(event.isPlaying)),
      player.addListener("timeUpdate", event => setCurrentTime(event.currentTime)),
      player.addListener("statusChange", event => setError(event.status === "error")),
    ];
    return () => subscriptions.forEach(s => s.remove());
  }, [player]);

  const visual = error
    ? <Text style={styles.error}>Demonstration video unavailable</Text>
    : <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false}
        allowsPictureInPicture={false} pointerEvents="none" />;
  return <PoseMedia name={name} duration={durationMs / 1000} visual={visual} aspectRatio={aspectRatio} currentTime={currentTime} playing={playing}
    onTogglePlayback={error ? undefined : () => playing ? player.pause() : player.play()} />;
}
const styles = StyleSheet.create({
  video: { width: "100%", height: "100%" },
  error: { color: colors.muted, fontSize: 14, textAlign: "center", padding: 16 },
});
