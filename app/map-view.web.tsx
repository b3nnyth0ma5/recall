import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { zincColors } from "@/constants/Colors";

export default function MapViewWeb() {
  console.log("[MapViewWeb] Rendered web fallback screen");

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Ionicons name="location-outline" size={48} color={zincColors[400]} />
      </View>
      <Text style={styles.title}>Map unavailable on web</Text>
      <Text style={styles.subtitle}>
        The map view is only available on the mobile app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: zincColors[800],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: zincColors[200],
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: zincColors[500],
    textAlign: "center",
    lineHeight: 20,
  },
});
