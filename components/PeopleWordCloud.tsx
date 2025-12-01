
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Person {
  id: string;
  person_name: string;
  mention_count?: number;
}

interface PeopleWordCloudProps {
  visible: boolean;
  onClose: () => void;
  onSave: (selectedPeople: Person[]) => void;
  initialSelectedPeople?: Person[];
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

  useEffect(() => {
    if (visible && user) {
      loadPeople();
    }
  }, [visible, user]);

  useEffect(() => {
    setSelectedPeople(initialSelectedPeople);
  }, [initialSelectedPeople]);

  const loadPeople = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch all people for this user
      const { data: personsData, error: personsError } = await supabase
        .from('persons')
        .select('id, person_name')
        .eq('user_id', user.id)
        .order('person_name', { ascending: true });

      if (personsError) {
        console.error('Error loading people:', personsError);
        setLoading(false);
        return;
      }

      if (!personsData || personsData.length === 0) {
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
        console.error('Error loading recall_people:', recallPeopleError);
        // Continue without mention counts
        setAllPeople(personsData.map(p => ({ ...p, mention_count: 0 })));
        setLoading(false);
        return;
      }

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

      peopleWithCounts.sort((a, b) => b.mention_count - a.mention_count);

      setAllPeople(peopleWithCounts);
      console.log(`Loaded ${peopleWithCounts.length} people`);
    } catch (error) {
      console.error('Error loading people:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePerson = (person: Person) => {
    const isSelected = selectedPeople.some(p => p.id === person.id);
    
    if (isSelected) {
      setSelectedPeople(selectedPeople.filter(p => p.id !== person.id));
    } else {
      setSelectedPeople([...selectedPeople, person]);
    }
  };

  const handleSave = () => {
    onSave(selectedPeople);
    onClose();
  };

  const handleCancel = () => {
    setSelectedPeople(initialSelectedPeople);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />
        
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <IconSymbol name="person.2.fill" size={24} color={colors.primary} />
              <Text style={styles.title}>Select People</Text>
            </View>
            <Pressable onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark" size={24} color={colors.textSecondary} />
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
                    {isSelected && (
                      <View style={styles.checkmark}>
                        <IconSymbol name="checkmark" size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={handleCancel}
              style={styles.cancelButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={styles.saveButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: Math.min(SCREEN_WIDTH - 40, 500),
    maxHeight: SCREEN_HEIGHT * 0.8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  selectedCountContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectedCountText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  scrollView: {
    flex: 1,
  },
  wordCloudContainer: {
    padding: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 8,
  },
  personChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  personName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  personNameSelected: {
    color: '#FFFFFF',
  },
  mentionBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mentionBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  mentionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mentionCountSelected: {
    color: '#FFFFFF',
  },
  checkmark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
