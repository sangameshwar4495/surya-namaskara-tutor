import { router } from "expo-router";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

export default function PracticeModeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>READY TO BEGIN</Text>

          <Text style={styles.title}>
            How would you like{"\n"}to practice?
          </Text>
        </View>

        {/* Full Sequence Demo */}
        <PracticeCard
          icon="play-circle"
          badge="4 MIN"
          title="View full sequence demo"
          description="Watch all 12 poses flow together before you begin."
          onPress={() => {
            router.push("/demo");
          } }
        />

        {/* Guided Practice */}
        <PracticeCard
          icon="user"
          badge="GUIDED"
          title="Step-by-step practice"
          description="Practice Prayer Pose and Raised Arms with live posture feedback and timed holds."
          onPress={() => {
            router.push("/calibration");
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function PracticeCard({
  icon,
  badge,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  badge: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        <View style={styles.iconContainer}>
          <Feather
            name={icon}
            size={28}
            color="rgb(39, 102, 82)"
          />
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      </View>

      <Text style={styles.cardTitle}>{title}</Text>

      <Text style={styles.cardDescription}>
        {description}
      </Text>

      <View style={styles.chooseRow}>
        <Text style={styles.chooseText}>
          Choose mode
        </Text>

        <Feather
          name="arrow-right"
          size={20}
          color="rgb(39, 102, 82)"
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F5EE",
  },

  content: {
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 30,
  },

  header: {
    marginBottom: 30,
  },

  eyebrow: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "rgb(39, 102, 82)",
    marginBottom: 10,
  },

  title: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "800",
    color: "#172923",
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    padding: 28,
    marginBottom: 30,

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
  },

  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#DCEBE4",
    justifyContent: "center",
    alignItems: "center",
  },

  badge: {
    backgroundColor: "#FFF0D9",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },

  badgeText: {
    color: "#E9952C",
    fontSize: 13,
    fontWeight: "800",
  },

  cardTitle: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "800",
    color: "#172923",
    marginBottom: 8,
  },

  cardDescription: {
    fontSize: 17,
    lineHeight: 24,
    color: "#68756F",
    marginBottom: 24,
  },

  chooseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  chooseText: {
    fontSize: 17,
    color: "rgb(39, 102, 82)",
    fontWeight: "500",
  },
});
