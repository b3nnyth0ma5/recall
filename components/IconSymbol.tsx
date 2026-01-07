
import React from "react";
import { StyleProp, ViewStyle, TextStyle } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

/**
 * Platform-agnostic icon component using MaterialIcons for consistent display across iOS, Android, and Web
 * 
 * This component uses Material Icons exclusively to ensure icons display correctly on all platforms.
 * Invalid icon names will show as "?" on Android/web.
 * 
 * Common valid icon names:
 * - Navigation: home, search, menu, close, arrow-back, arrow-forward, arrow-upward, arrow-downward
 * - Actions: add, remove, delete, edit, save, share, download, upload, refresh, check, clear
 * - User: person, account-circle, group, favorite, star
 * - Communication: phone, email, message, chat, send, notifications
 * - Media: camera, photo, image, videocam, music-note, play-arrow, pause, stop
 * - UI: visibility, lock, settings, help, info, warning, error
 * - Location: location-on, map, place, navigation, explore
 * - Time: schedule, event, timer, alarm
 */
export function IconSymbol({
  ios_icon_name,
  android_material_icon_name,
  name,
  size = 24,
  color,
  style,
}: {
  ios_icon_name?: string;
  android_material_icon_name?: string;
  name?: string;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Prioritize android_material_icon_name, then name, then ios_icon_name (for backwards compatibility)
  const iconName = android_material_icon_name || name || ios_icon_name;
  
  if (!iconName) {
    console.warn('IconSymbol: No icon name provided');
    return null;
  }

  // Check if the icon name exists in MaterialIcons
  const materialIconsGlyphMap = MaterialIcons.glyphMap as Record<string, number>;
  if (!materialIconsGlyphMap[iconName]) {
    console.warn(`IconSymbol: Invalid Material icon name "${iconName}". This will display as "?" on Android/web. Use valid Material Icons names like: home, person, search, settings, etc.`);
  }

  return (
    <MaterialIcons
      name={iconName as any}
      size={size}
      color={color}
      style={style as StyleProp<TextStyle>}
    />
  );
}
