
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

export default function ProfileScreen() {
  const handleSupabaseSetup = () => {
    Alert.alert(
      'Cloud Sync Setup',
      'To enable cloud sync:\n\n' +
      '1. Press the Supabase button in the Natively interface\n' +
      '2. Connect to your Supabase project (create one if needed)\n' +
      '3. Your notes will automatically sync across devices\n\n' +
      'For now, your notes are stored locally on this device.',
      [{ text: 'Got it' }]
    );
  };

  const handleExport = () => {
    Alert.alert(
      'Export Notes',
      'Export functionality will be available soon. Your notes are safely stored locally.',
      [{ text: 'OK' }]
    );
  };

  const handleAbout = () => {
    Alert.alert(
      'About',
      'Simple Notes App\nVersion 1.0.0\n\nA clean and intuitive note-taking app with image support.',
      [{ text: 'OK' }]
    );
  };

  return (
    <>
      {Platform.OS === 'ios' && (
        <Stack.Screen
          options={{
            title: 'Settings',
          }}
        />
      )}
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cloud Sync</Text>
          
          <Pressable style={styles.card} onPress={handleSupabaseSetup}>
            <View style={styles.cardIcon}>
              <IconSymbol name="cloud" size={24} color={colors.primary} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Enable Cloud Sync</Text>
              <Text style={styles.cardDescription}>
                Sync your notes across all your devices
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.infoCard}>
            <IconSymbol name="info.circle" size={20} color={colors.accent} />
            <Text style={styles.infoText}>
              Your notes are currently stored locally. Enable cloud sync to access them from any device.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          
          <Pressable style={styles.card} onPress={handleExport}>
            <View style={styles.cardIcon}>
              <IconSymbol name="square.and.arrow.up" size={24} color={colors.secondary} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Export Notes</Text>
              <Text style={styles.cardDescription}>
                Save a backup of all your notes
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          
          <Pressable style={styles.card} onPress={handleAbout}>
            <View style={styles.cardIcon}>
              <IconSymbol name="info.circle" size={24} color={colors.text} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>About This App</Text>
              <Text style={styles.cardDescription}>
                Version and information
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ using React Native + Expo
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingVertical: 20,
    paddingBottom: Platform.OS !== 'ios' ? 100 : 20,
  },
  section: {
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
