
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
  mention_count?: number;
}

interface PeopleWordCloudProps {
  visible: boolean;
  onClose: () => void;
  onSave: (selectedPeople: Person[]) => void;
  initialSelectedPeople?: Person[];
}

export function PeopleWordCloud({
  visible,
  onClose,
  onSave,
  initialSelectedPeople = [],
}: PeopleWordCloudProps) {
  const { user } = useAuth();
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Person[]>(initialSelectedPeople);
  const [loading, setLoading] = useState(false);

  const loadPeople = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      console.log('[PeopleWordCloud] Loading people for user:', user.id);
      
      // Fetch all people for this user
      const { data: personsData, error: personsError } = await supabase
        .from('persons')
        .select('id, person_name, photo_url')
        .eq('user_id', user.id)
        .order('person_name', { ascending: true });

      if (personsError) {
        console.error('[PeopleWordCloud] Error loading people:', personsError);
        setLoading(false);
        return;
      }

      console.log('[PeopleWordCloud] Fetched persons data:', personsData);

      if (!personsData || personsData.length === 0) {
        console.log('[PeopleWordCloud] No people found');
        setAllPeople([]);
        setLoading(false);
        return;
      }

      // Get mention counts for all people
      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('person_id')
        .eq('user_id', user.id);

      if (recallPeopleError) {
        console.error('[PeopleWordCloud] Error loading recall_people:', recallPeopleError);
        // Continue without mention counts
        setAllPeople(personsData.map(p => ({ ...p, mention_count: 0 })));
        setLoading(false);
        return;
      }

      console.log('[PeopleWordCloud] Fetched recall_people data:', recallPeopleData);

      // Count mentions per person
      const mentionCounts: { [personId: string]: number } = {};
      (recallPeopleData || []).forEach((rp: any) => {
        mentionCounts[rp.person_id] = (mentionCounts[rp.person_id] || 0) + 1;
      });

      // Add mention counts to people and sort by mention count (descending)
      const peopleWithCounts = personsData.map(p => ({
        ...p,
        mention_count: mentionCounts[p.id] || 0,
      }));

      peopleWithCounts.sort((a, b) =>
        a.person_name.localeCompare(b.person_name, undefined, { sensitivity: 'base' })
      );

      console.log(`[PeopleWordCloud] Loaded ${peopleWithCounts.length} people with mention counts`);
      setAllPeople(peopleWithCounts);
    } catch (error) {
      console.error('[PeopleWordCloud] Error loading people:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (visible && user) {
      loadPeople();
    }
  }, [visible, user, loadPeople]);

  useEffect(() => {
    setSelectedPeople(initialSelectedPeople);
  }, [initialSelectedPeople]);

  const togglePerson = (person: Person) => {
    const isSelected = selectedPeople.some(p => p.id === person.id);
    
    if (isSelected) {
      setSelectedPeople(selectedPeople.filter(p => p.id !== person.id));
    } else {
      setSelectedPeople([...selectedPeople, person]);
    }
  };

  const handleSave = () => {
    console.log('[PeopleWordCloud] Saving selected people:', selectedPeople);
    onSave(selectedPeople);
    onClose();
  };

  const handleCancel = () => {
    console.log('[PeopleWordCloud] Cancelling, resetting to initial selection');
    setSelectedPeople(initialSelectedPeople);
    onClose();
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header - matching note-editor UI */}
      <View style={styles.header}>
        <Pressable 
          onPress={handleCancel} 
          style={styles.headerButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
        </Pressable>
        
        <Text style={styles.headerTitle}>Select People</Text>
        
        <Pressable
          onPress={handleSave}
          style={styles.saveButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.checkmarkContainer}>
            <IconSymbol name="checkmark" size={20} color="#FFFFFF" />
          </View>
        </Pressable>
      </View>

      {selectedPeople.length > 0 && (
        <View style={styles.selectedCountContainer}>
          <Text style={styles.selectedCountText}>
            {selectedPeople.length} {selectedPeople.length === 1 ? 'person' : 'people'} selected
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading people...</Text>
        </View>
      ) : allPeople.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol name="person.2" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No people found</Text>
          <Text style={styles.emptySubtext}>
            People will appear here once they&apos;re mentioned in your recalls
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.wordCloudContainer}
          showsVerticalScrollIndicator={true}
        >
          {allPeople.map((person) => {
            const isSelected = selectedPeople.some(p => p.id === person.id);
            
            return (
              <Pressable
                key={person.id}
                onPress={() => togglePerson(person)}
                style={[
                  styles.personChip,
                  isSelected && styles.personChipSelected,
                ]}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text
                  style={[
                    styles.personName,
                    isSelected && styles.personNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {person.person_name}
                </Text>
                {person.mention_count !== undefined && person.mention_count > 0 && (
                  <View style={[
                    styles.mentionBadge,
                    isSelected && styles.mentionBadgeSelected,
                  ]}>
                    <Text style={[
                      styles.mentionCount,
                      isSelected && styles.mentionCountSelected,
                    ]}>
                      {person.mention_count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.primary,
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12 * 1.15,
    paddingVertical: 8 * 1.15,
    borderRadius: 20,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkmarkContainer: {
    width: 24,
    height: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCountContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectedCountText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
  scrollView: {
    flex: 1,
  },
  wordCloudContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
  },
  personChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  personName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  personNameSelected: {
    color: '#FFFFFF',
  },
  mentionBadge: {
    backgroundColor: colors.primary,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mentionBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  mentionCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mentionCountSelected: {
    color: '#FFFFFF',
  },
});
