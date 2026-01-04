
import { useAuth } from '@/contexts/AuthContext';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/utils/supabase';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import React, { useState, useEffect, useCallback } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
  mention_count?: number;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 10000,
  },
  slideUpContainer: {
    height: SCREEN_HEIGHT * 0.85,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  saveButtonTextDisabled: {
    color: colors.textTertiary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
  },
  peopleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.secondaryBackground,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  personChipSelected: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  personName: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default function PeopleWordCloudScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (params.initialSelectedPeople) {
      try {
        const initial = JSON.parse(params.initialSelectedPeople as string);
        setSelectedPeople(initial);
      } catch (error) {
        console.error('Error parsing initial selected people:', error);
      }
    }
  }, [params.initialSelectedPeople]);

  useEffect(() => {
    if (user) {
      loadPeople();
    }
  }, [user]);

  const loadPeople = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('user_id', user.id)
        .order('person_name', { ascending: true });

      if (error) throw error;

      setPeople(data || []);
    } catch (error) {
      console.error('Error loading people:', error);
      Alert.alert('Error', 'Failed to load people');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const togglePerson = (person: Person) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const isSelected = selectedPeople.some(p => p.id === person.id);
    if (isSelected) {
      setSelectedPeople(selectedPeople.filter(p => p.id !== person.id));
    } else {
      setSelectedPeople([...selectedPeople, person]);
    }
  };

  const hasChanges = () => {
    const initialPeople = params.initialSelectedPeople 
      ? JSON.parse(params.initialSelectedPeople as string) 
      : [];
    
    if (selectedPeople.length !== initialPeople.length) return true;
    
    return selectedPeople.some(
      person => !initialPeople.find((p: Person) => p.id === person.id)
    );
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    router.setParams({
      selectedPeople: JSON.stringify(selectedPeople),
    });
    
    handleCancel();
  };

  const handleCancel = () => {
    router.back();
  };

  const truncateName = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength - 3) + '...';
  };

  return (
    <Modal
      visible={true}
      animationType="none"
      transparent={true}
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <Animated.View 
        entering={SlideInDown.duration(300)} 
        style={styles.modalContainer}
      >
        <Pressable style={{ flex: 1 }} onPress={handleCancel} />
        <View style={styles.slideUpContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleCancel} style={styles.closeButton}>
              <IconSymbol 
                ios_icon_name="xmark" 
                android_material_icon_name="close" 
                size={24} 
                color={colors.text} 
              />
            </Pressable>
            <Text style={styles.headerTitle}>Select People</Text>
            <Pressable 
              onPress={handleSave} 
              disabled={!hasChanges()}
              style={styles.saveButton}
            >
              <Text style={[
                styles.saveButtonText,
                !hasChanges() && styles.saveButtonTextDisabled
              ]}>
                Save
              </Text>
            </Pressable>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : people.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No people found. People will appear here once they are mentioned in your recalls.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={styles.description}>
                Select people to associate with this recall
              </Text>
              
              <View style={styles.peopleGrid}>
                {people.map((person) => {
                  const isSelected = selectedPeople.some(p => p.id === person.id);
                  return (
                    <Pressable
                      key={person.id}
                      style={[
                        styles.personChip,
                        isSelected && styles.personChipSelected,
                      ]}
                      onPress={() => togglePerson(person)}
                    >
                      <PersonAvatar
                        person={person}
                        size={24}
                      />
                      <Text style={styles.personName}>
                        {truncateName(person.person_name)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}
