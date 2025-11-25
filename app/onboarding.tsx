
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OnboardingScreen() {
  const [currentPage, setCurrentPage] = useState(0);
  const router = useRouter();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const handleNext = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }

    if (currentPage < 2) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      scrollViewRef.current?.scrollTo({ x: nextPage * SCREEN_WIDTH, animated: true });
    }
  };

  const handleGetStarted = async () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }

    try {
      // Update user_journeys table to mark onboarding as complete
      if (user?.id) {
        console.log('[Onboarding] Marking onboarding as complete for user:', user.id);
        
        // Check if user_journeys record exists
        const { data: existingJourney, error: fetchError } = await supabase
          .from('user_journeys')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('[Onboarding] Error fetching user journey:', fetchError);
        }

        if (existingJourney) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('user_journeys')
            .update({ main_onboarding_date: new Date().toISOString() })
            .eq('user_id', user.id);

          if (updateError) {
            console.error('[Onboarding] Error updating user journey:', updateError);
          } else {
            console.log('[Onboarding] Successfully updated user journey');
          }
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('user_journeys')
            .insert({
              user_id: user.id,
              main_onboarding_date: new Date().toISOString(),
            });

          if (insertError) {
            console.error('[Onboarding] Error inserting user journey:', insertError);
          } else {
            console.log('[Onboarding] Successfully inserted user journey');
          }
        }
      }

      // Navigate to home screen
      router.replace('/(tabs)/(home)');
    } catch (error) {
      console.error('[Onboarding] Error completing onboarding:', error);
      // Navigate anyway to avoid blocking the user
      router.replace('/(tabs)/(home)');
    }
  };

  const handleSkip = async () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }

    await handleGetStarted();
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage) {
      setCurrentPage(page);
    }
  };

  return (
    <View style={styles.container}>
      {/* Skip Button */}
      <Pressable onPress={handleSkip} style={styles.skipButton}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      {/* Scrollable Pages */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {/* Page 1: Welcome */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <View style={styles.pageContent}>
            <View style={styles.iconContainer}>
              <IconSymbol name="sparkles" size={80} color={colors.primary} />
            </View>
            <Text style={styles.title}>Welcome to Recall</Text>
            <Text style={styles.description}>
              Discover amazing features designed to make your life easier and more productive.
            </Text>
          </View>
        </View>

        {/* Page 2: Features */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <View style={styles.pageContent}>
            <View style={styles.featuresContainer}>
              <View style={styles.featureIconWrapper}>
                <View style={styles.featureIconCircle}>
                  <IconSymbol name="camera.fill" size={48} color={colors.primary} />
                </View>
              </View>
              <View style={styles.featureIconWrapper}>
                <View style={styles.featureIconCircle}>
                  <IconSymbol name="text.alignleft" size={48} color={colors.primary} />
                </View>
              </View>
              <View style={styles.featureIconWrapper}>
                <View style={styles.featureIconCircle}>
                  <IconSymbol name="map.fill" size={48} color={colors.primary} />
                </View>
              </View>
            </View>
            <Text style={styles.title}>Lightning Fast Performance</Text>
            <Text style={styles.description}>
              Experience blazing fast speeds with optimized performance that keeps you productive all day long.
            </Text>
          </View>
        </View>

        {/* Page 3: Get Started */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <View style={styles.pageContent}>
            <View style={styles.iconContainer}>
              <IconSymbol name="magnifyingglass" size={80} color={colors.primary} />
            </View>
            <Text style={styles.title}>You&apos;re All Set!</Text>
            <Text style={styles.description}>
              Join thousands of satisfied users and start your journey today
            </Text>
            <View style={styles.statsContainer}>
              <View style={styles.statBadge}>
                <Text style={styles.statText}>⭐4.9/5 RATING</Text>
              </View>
              <View style={styles.statBadge}>
                <Text style={styles.statText}>👥50K+ USERS</Text>
              </View>
            </View>
            <View style={styles.benefitsContainer}>
              <View style={styles.benefitRow}>
                <IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} />
                <Text style={styles.benefitText}>Unlimited access to all premium features</Text>
              </View>
              <View style={styles.benefitRow}>
                <IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} />
                <Text style={styles.benefitText}>Bank-level security for your data</Text>
              </View>
              <View style={styles.benefitRow}>
                <IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} />
                <Text style={styles.benefitText}>Collaborate with unlimited team members</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Page Indicators */}
      <View style={styles.indicatorContainer}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.indicator,
              currentPage === index && styles.indicatorActive,
            ]}
          />
        ))}
      </View>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        {currentPage < 2 ? (
          <Pressable onPress={handleNext} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>Next</Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleGetStarted} style={styles.getStartedButton}>
            <Text style={styles.getStartedButtonText}>Get Started Now</Text>
            <IconSymbol name="arrow.right" size={20} color="#FFFFFF" />
          </Pressable>
        )}
        <Text style={styles.footerText}>🔒 Your data is secure and encrypted</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 48 : 60,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pageContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 400,
  },
  iconContainer: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuresContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    gap: 24,
  },
  featureIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statBadge: {
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  benefitsContainer: {
    width: '100%',
    gap: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
  },
  benefitText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.inactive,
  },
  indicatorActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  bottomContainer: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'android' ? 32 : 48,
    alignItems: 'center',
    gap: 12,
  },
  nextButton: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  getStartedButton: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  getStartedButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footerText: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
