import { registerRootComponent } from "expo";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import App from "./App";

function Root() {
  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const hideSystemNavigation = async () => {
      try {
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setVisibilityAsync("hidden");
      } catch (_error) {
        // Some edge-to-edge modes only honor the build-time immersive setting.
      }
    };

    hideSystemNavigation();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        hideSystemNavigation();
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1, backgroundColor: "#173038" }} edges={["top"]}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#eef3f6" }} edges={["bottom"]}>
          <App />
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

registerRootComponent(Root);
