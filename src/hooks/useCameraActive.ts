import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

/** Release camera resources when a screen is covered or the app backgrounds. */
export function useCameraActive() {
  const [focused, setFocused] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  return focused && appState === "active";
}
