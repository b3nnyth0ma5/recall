import * as React from "react";
import { createContext, useCallback, useContext } from "react";
import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";

type WidgetContextType = {
  refreshWidget: () => void;
};

const WidgetContext = createContext<WidgetContextType | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
  // Update widget state whenever what we want to show changes
  React.useEffect(() => {
    if (Platform.OS === "ios") {
      const storage = new ExtensionStorage("group.com.b3nny1nc.recall");
      // set widget_state to null if we want to reset the widget
      // storage.set("widget_state", null);
      console.log("[WidgetContext] Reloading widget on mount", storage);
      ExtensionStorage.reloadWidget();
    }
  }, []);

  const refreshWidget = useCallback(() => {
    console.log("[WidgetContext] refreshWidget called");
    if (Platform.OS === "ios") {
      const storage = new ExtensionStorage("group.com.b3nny1nc.recall");
      console.log("[WidgetContext] Reloading widget", storage);
      ExtensionStorage.reloadWidget();
    }
  }, []);

  return (
    <WidgetContext.Provider value={{ refreshWidget }}>
      {children}
    </WidgetContext.Provider>
  );
}

export const useWidget = () => {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error("useWidget must be used within a WidgetProvider");
  }
  return context;
};
