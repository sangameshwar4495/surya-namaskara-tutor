import React, {
  useMemo,
  useState,
} from "react";

import {
  StyleSheet,
  View,
} from "react-native";

import Svg, {
  Circle,
  Line,
} from "react-native-svg";

import { Landmark } from "../types/pose";

const CONNECTIONS: [
  number,
  number
][] = [
  // Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],

  // Arms
  [11, 12],

  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],

  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],

  // Torso
  [11, 23],
  [12, 24],
  [23, 24],

  // Left leg
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],

  // Right leg
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
];

export default function PoseCanvas({
  landmarks,
  sourceAspect = 3 / 4,
}: {
  landmarks: Landmark[];
  sourceAspect?: number;
}) {
  const [size, setSize] =
    useState({
      width: 0,
      height: 0,
    });

  const transformed =
    useMemo(() => {
      if (
        size.width <= 0 ||
        size.height <= 0
      ) {
        return null;
      }

      /*
       * The camera is using resizeMode="contain".
       *
       * After our 90° sensor rotation,
       * use the selected camera format's portrait aspect ratio.
       *
       * Calculate the exact rendered image
       * rectangle inside the camera view so
       * the skeleton stays on the body.
       */
      const viewAspect =
        size.width / size.height;

      let drawWidth =
        size.width;

      let drawHeight =
        size.height;

      let offsetX = 0;
      let offsetY = 0;

      if (
        viewAspect >
        sourceAspect
      ) {
        // Vertical space is limiting.
        drawHeight = size.height;
        drawWidth =
          drawHeight *
          sourceAspect;

        offsetX =
          (size.width -
            drawWidth) /
          2;
      } else {
        // Horizontal space is limiting.
        drawWidth = size.width;

        drawHeight =
          drawWidth /
          sourceAspect;

        offsetY =
          (size.height -
            drawHeight) /
          2;
      }

      return landmarks.map(
        (point) => ({
          x:
            offsetX +
            point.x * drawWidth,

          y:
            offsetY +
            point.y * drawHeight,
        })
      );
    }, [landmarks, size, sourceAspect]);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const {
          width,
          height,
        } = event.nativeEvent.layout;

        setSize({
          width,
          height,
        });
      }}
    >
      {transformed &&
        size.width > 0 &&
        size.height > 0 && (
          <Svg
            width={size.width}
            height={size.height}
          >
            {/* Skeleton */}
            {CONNECTIONS.map(
              ([a, b], index) => {
                const p1 =
                  transformed[a];

                const p2 =
                  transformed[b];

                if (!p1 || !p2) {
                  return null;
                }

                return (
                  <Line
                    key={`line-${index}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#45E66B"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                );
              }
            )}

            {/* Landmark points */}
            {transformed.map(
              (point, index) => (
                <Circle
                  key={`point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={5}
                  fill="#FFFFFF"
                  stroke="#45E66B"
                  strokeWidth={2}
                />
              )
            )}
          </Svg>
        )}
    </View>
  );
}
