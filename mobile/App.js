import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MES Lite Operator</Text>
      <Text style={styles.subtitle}>Assigned work orders will appear here.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f4f7f9"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#17202a"
  },
  subtitle: {
    marginTop: 8,
    color: "#60707d"
  }
});
