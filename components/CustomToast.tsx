
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';
import { colors } from '@/styles/commonStyles';

export const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={styles.successToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={styles.errorToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={styles.infoToast}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
    />
  ),
};

const styles = StyleSheet.create({
  successToast: {
    borderLeftColor: colors.primary,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
  },
  errorToast: {
    borderLeftColor: colors.error,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
  },
  infoToast: {
    borderLeftColor: colors.searchAccent,
    backgroundColor: colors.card,
    borderLeftWidth: 5,
  },
  contentContainer: {
    paddingHorizontal: 15,
  },
  text1: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  text2: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
