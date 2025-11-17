
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import { BlurView } from 'expo-blur';

export const toastConfig: ToastConfig = {
  success: (props) => (
    <Pressable
      onPress={props.onPress}
      style={styles.toastContainer}
    >
      <BlurView intensity={80} style={styles.toastBlur}>
        <View style={styles.toastContent}>
          <View style={[styles.iconContainer, styles.successIcon]}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check_circle"
              size={24}
              color={colors.primary}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.toastTitle}>{props.text1}</Text>
            {props.text2 && (
              <Text style={styles.toastMessage}>{props.text2}</Text>
            )}
          </View>
        </View>
      </BlurView>
    </Pressable>
  ),
  error: (props) => (
    <Pressable
      onPress={props.onPress}
      style={styles.toastContainer}
    >
      <BlurView intensity={80} style={styles.toastBlur}>
        <View style={styles.toastContent}>
          <View style={[styles.iconContainer, styles.errorIcon]}>
            <IconSymbol
              ios_icon_name="exclamationmark.circle.fill"
              android_material_icon_name="error"
              size={24}
              color={colors.error}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.toastTitle}>{props.text1}</Text>
            {props.text2 && (
              <Text style={styles.toastMessage}>{props.text2}</Text>
            )}
          </View>
        </View>
      </BlurView>
    </Pressable>
  ),
  info: (props) => (
    <Pressable
      onPress={props.onPress}
      style={styles.toastContainer}
    >
      <BlurView intensity={80} style={styles.toastBlur}>
        <View style={styles.toastContent}>
          <View style={[styles.iconContainer, styles.infoIcon]}>
            <IconSymbol
              ios_icon_name="info.circle.fill"
              android_material_icon_name="info"
              size={24}
              color={colors.primary}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.toastTitle}>{props.text1}</Text>
            {props.text2 && (
              <Text style={styles.toastMessage}>{props.text2}</Text>
            )}
          </View>
        </View>
      </BlurView>
    </Pressable>
  ),
};

const styles = StyleSheet.create({
  toastContainer: {
    width: '90%',
    maxWidth: 400,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
  },
  iconContainer: {
    marginRight: 12,
  },
  successIcon: {
    // Additional styling if needed
  },
  errorIcon: {
    // Additional styling if needed
  },
  infoIcon: {
    // Additional styling if needed
  },
  textContainer: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  toastMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
