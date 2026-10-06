import { StyleSheet } from "react-native";

// Match Practice Mode and the existing primary buttons.
export const colors = { background: "#F7F5EE", text: "#172923", muted: "#68756F", accent: "rgb(39, 102, 82)", primary: "rgb(91,123,97)", pale: "#DCEBE4", white: "#FFFFFF" };
export const demoStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30, gap: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 32, lineHeight: 39, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 17, lineHeight: 25, color: colors.muted },
  eyebrow: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3, color: colors.accent },
  iconButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.pale, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.white, borderRadius: 30, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 3 },
  primary: { backgroundColor: colors.primary, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, alignItems: "center", justifyContent: "center", minHeight: 54 },
  buttonText: { color: colors.white, fontSize: 18, fontWeight: "600", textAlign: "center" },
});
