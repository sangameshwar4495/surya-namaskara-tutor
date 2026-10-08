import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

/** Prayer silhouette and the supplied side-view Hasta Uttanasana reference. */
export default function TargetPoseOverlay({ poseIndex, sourceAspect, setup, framed }: {
  poseIndex: number; sourceAspect: number; setup: boolean; framed: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = Math.min(size.width, size.height * sourceAspect);
  const height = width / sourceAspect;
  if (poseIndex === 1) return <View pointerEvents="none" style={StyleSheet.absoluteFill}
    onLayout={e => setSize(e.nativeEvent.layout)} accessible={false}>
    <Image source={require("../../assets/hasta-uttanasana-reference.png")} resizeMode="contain"
      style={{ width, height, left: (size.width - width) / 2, top: (size.height - height) / 2, opacity: 0.22 }} />
  </View>;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}
    onLayout={e => setSize(e.nativeEvent.layout)} accessible={false}>
    <Svg width={width} height={height} viewBox="0 0 300 400"
      preserveAspectRatio="none" style={{ left: (size.width - width) / 2, top: (size.height - height) / 2 }}>
      {setup && <Rect x="12" y="16" width="276" height="368" rx="16"
        fill="none" stroke={framed ? "#78E6A2" : "#FFFFFF"} strokeOpacity={0.7} strokeWidth="2" strokeDasharray="8 7" />}
      <G opacity={0.22} fill="#FFFFFF" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="150" cy="99" r="18" stroke="none" />
        <Path d="M150 125 L150 223" strokeWidth="46" />
        <Path d="M137 222 L136 287 L138 359 M163 222 L164 287 L162 359" fill="none" strokeWidth="20" />
        <Path d="M138 363 L126 366 M162 363 L174 366" strokeWidth="14" />
        <Path d={setup
          ? "M126 133 L111 182 L103 230 M174 133 L189 182 L197 230"
          : poseIndex === 0
            ? "M126 133 L105 177 L146 153 M174 133 L195 177 L154 153"
            : "M126 133 L115 84 L124 31 M174 133 L185 84 L176 31"}
          fill="none" strokeWidth="16" />
      </G>
    </Svg>
  </View>;
}
