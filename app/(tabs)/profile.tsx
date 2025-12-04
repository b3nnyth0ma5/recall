
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { CacheManager } from '@/utils/memoryCache';
import { supabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [cacheStats, setCacheStats] = useState<any[]>([]);
  const [combinedAddSearchEnabled, setCombinedAddSearchEnabled] = useState(false);
  const [loadingPreferences, setLoadingPreferences] = useState(true);

  // Load user preferences
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!user) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('combined_add_search_enabled')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading user preferences:', error);
        } else if (data) {
          setCombinedAddSearchEnabled(data.combined_add_search_enabled || false);
        }
      } catch (error) {
        console.error('Exception loading user preferences:', error);
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadUserPreferences();
  }, [user]);

  // Load cache statistics
  useEffect(() => {
    const loadCacheStats = () => {
      const stats = CacheManager.getAllStats();
      setCacheStats(stats);
    };

    loadCacheStats();
    
    // Refresh stats every 5 seconds
    const interval = setInterval(loadCacheStats, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/login');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data. The app will reload data from the server as needed.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            CacheManager.clearAll();
            
            // Haptic feedback
            if (Platform.OS !== 'web') {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (error) {
                console.error('Error triggering haptic feedback:', error);
              }
            }
            
            Alert.alert('Success', 'Cache cleared successfully');
            
            // Reload stats
            const stats = CacheManager.getAllStats();
            setCacheStats(stats);
          },
        },
      ]
    );
  };

  const handleLogCacheStats = () => {
    CacheManager.logStats();
    
    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    Alert.alert('Cache Stats', 'Check the console for detailed cache statistics');
  };

  const getCacheIcon = (cacheName: string) => {
    switch (cacheName) {
      case 'ImageCache':
        return 'photo';
      case 'NoteCache':
        return 'doc.text';
      case 'CategoryCache':
        return 'folder';
      case 'PeopleCache':
        return 'person.2';
      default:
        return 'square.stack.3d.up';
    }
  };

  const getCacheColor = (utilizationPercent: number) => {
    if (utilizationPercent < 50) {
      return '#4CAF50'; // Green
    } else if (utilizationPercent < 80) {
      return '#FF9800'; // Orange
    } else {
      return '#F44336'; // Red
    }
  };

  const handleToggleCombinedAddSearch = async (value: boolean) => {
    if (!user) {
      return;
    }

    try {
      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }

      setCombinedAddSearchEnabled(value);

      // Upsert user preferences
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          combined_add_search_enabled: value,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Error updating user preferences:', error);
        Alert.alert('Error', 'Failed to update preferences');
        // Revert the toggle
        setCombinedAddSearchEnabled(!value);
      } else {
        Alert.alert(
          'Success',
          value
            ? 'Combined add/search UI enabled. Please restart the app to see changes.'
            : 'Combined add/search UI disabled. Please restart the app to see changes.'
        );
      }
    } catch (error) {
      console.error('Exception updating user preferences:', error);
      Alert.alert('Error', 'Failed to update preferences');
      // Revert the toggle
      setCombinedAddSearchEnabled(!value);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Profile',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontSize: 20,
            fontWeight: 'bold',
            color: colors.primary,
          },
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* User Info Section */}
        <View style={styles.section}>
          <View style={styles.userInfoContainer}>
            <View style={styles.avatarContainer}>
              <IconSymbol name="person.circle.fill" size={80} color={colors.primary} />
            </View>
            <Text style={styles.userEmail}>{user?.email || 'Not signed in'}</Text>
          </View>
        </View>

        {/* Cache Statistics Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="square.stack.3d.up" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Memory Cache (iOS NSCache-style)</Text>
          </View>
          
          <Text style={styles.sectionDescription}>
            Intelligent memory management with automatic eviction based on cost and usage patterns
          </Text>

          {cacheStats.map((stats, index) => {
            const cacheName = ['ImageCache', 'NoteCache', 'CategoryCache', 'PeopleCache'][index];
            const utilizationColor = getCacheColor(stats.utilizationPercent);
            
            return (
              <View key={index} style={styles.cacheCard}>
                <View style={styles.cacheHeader}>
                  <View style={styles.cacheHeaderLeft}>
                    <IconSymbol 
                      name={getCacheIcon(cacheName)} 
                      size={20} 
                      color={colors.primary} 
                    />
                    <Text style={styles.cacheName}>{cacheName}</Text>
                  </View>
                  <View style={[styles.utilizationBadge, { backgroundColor: `${utilizationColor}20` }]}>
                    <Text style={[styles.utilizationText, { color: utilizationColor }]}>
                      {stats.utilizationPercent.toFixed(0)}%
                    </Text>
                  </View>
                </View>

                <View style={styles.cacheStats}>
                  <View style={styles.cacheStatRow}>
                    <Text style={styles.cacheStatLabel}>Items:</Text>
                    <Text style={styles.cacheStatValue}>
                      {stats.itemCount} / {stats.countLimit}
                    </Text>
                  </View>
                  <View style={styles.cacheStatRow}>
                    <Text style={styles.cacheStatLabel}>Memory:</Text>
                    <Text style={styles.cacheStatValue}>
                      {stats.totalCostMB.toFixed(2)} MB / {stats.totalCostLimitMB.toFixed(2)} MB
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBar, 
                      { 
                        width: `${Math.min(stats.utilizationPercent, 100)}%`,
                        backgroundColor: utilizationColor,
                      }
                    ]} 
                  />
                </View>
              </View>
            );
          })}

          <View style={styles.cacheActions}>
            <Pressable 
              onPress={handleClearCache} 
              style={styles.cacheActionButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="trash" size={18} color={colors.error} />
              <Text style={[styles.cacheActionText, { color: colors.error }]}>Clear Cache</Text>
            </Pressable>

            <Pressable 
              onPress={handleLogCacheStats} 
              style={styles.cacheActionButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="doc.text" size={18} color={colors.primary} />
              <Text style={styles.cacheActionText}>Log Stats</Text>
            </Pressable>
          </View>
        </View>

        {/* Feature Toggles Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="sparkles" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Experimental Features</Text>
          </View>

          <Text style={styles.sectionDescription}>
            Try out new features before they&apos;re released to everyone
          </Text>

          <View style={styles.featureToggleCard}>
            <View style={styles.featureToggleContent}>
              <View style={styles.featureToggleHeader}>
                <IconSymbol name="plus.magnifyingglass" size={20} color={colors.primary} />
                <Text style={styles.featureToggleName}>Combined Add/Search</Text>
              </View>
              <Text style={styles.featureToggleDescription}>
                New unified interface for creating recalls and searching. Includes speech-to-text, image upload, and location selection in one place.
              </Text>
            </View>
            <Switch
              value={combinedAddSearchEnabled}
              onValueChange={handleToggleCombinedAddSearch}
              disabled={loadingPreferences}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
              ios_backgroundColor={colors.border}
            />
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="person" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>

          <Pressable 
            onPress={handleSignOut} 
            style={styles.signOutButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol name="arrow.right.square" size={20} color={colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Recall App v1.0.0</Text>
          <Text style={styles.appInfoText}>© 2024 Recall. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  userInfoContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cacheCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cacheHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cacheHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cacheName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  utilizationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  utilizationText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cacheStats: {
    gap: 8,
    marginBottom: 12,
  },
  cacheStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cacheStatLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cacheStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  cacheActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cacheActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cacheActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  featureToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  featureToggleContent: {
    flex: 1,
    gap: 8,
  },
  featureToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureToggleName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  featureToggleDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  appInfoText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
});
