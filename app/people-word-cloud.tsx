
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { PersonAvatar } from '@/components/PersonAvatar';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
  mention_count?: number;
}

export default function PeopleWordCloudScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [initialSelectedPeople, setInitialSelectedPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const recallId = params.recallId as string | undefined;

  // Parse initial selected people from params
  useEffect(() => {
    if (params.initialSelectedPeople) {
      try {
        const parsed = JSON.parse(params.initialSelectedPeople as string);
        setSelectedPeople(parsed);
        setInitialSelectedPeople(parsed);
        console.log('[PeopleWordCloud] Loaded initial selected people:', parsed);
      } catch (error) {
        console.error('[PeopleWordCloud] Error parsing initial selected people:', error);
      }
    }
  }, [params.initialSelectedPeople]);

  useEffect(() => {
    if (user) {
      loadPeople();
    }
  }, [user]);

  const loadPeople = async () => {
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

      peopleWithCounts.sort((a, b) => b.mention_count - a.mention_count);

      console.log(`[PeopleWordCloud] Loaded ${peopleWithCounts.length} people with mention counts`);
      setAllPeople(peopleWithCounts);
    } catch (error) {
      console.error('[PeopleWordCloud] Error loading people:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePerson = (person: Person) => {
    const isSelected = selectedPeople.some(p => p.id === person.id);
    
    if (isSelected) {
      const newSelection = selectedPeople.filter(p => p.id !== person.id);
      setSelectedPeople(newSelection);
      console.log('[PeopleWordCloud] Deselected person:', person.person_name, 'New count:', newSelection.length);
    } else {
      const newSelection = [...selectedPeople, person];
      setSelectedPeople(newSelection);
      console.log('[PeopleWordCloud] Selected person:', person.person_name, 'New count:', newSelection.length);
    }
  };

  const hasChanges = () => {
    if (initialSelectedPeople.length !== selectedPeople.length) {
      return true;
    }
    const initialIds = new Set(initialSelectedPeople.map(p => p.id));
    const currentIds = new Set(selectedPeople.map(p => p.id));
    for (const id of currentIds) {
      if (!initialIds.has(id)) {
        return true;
      }
    }
    for (const id of initialIds) {
      if (!currentIds.has(id)) {
        return true;
      }
    }
    return false;
  };

  const handleSave = async () => {
    console.log('[PeopleWordCloud] ===== SAVE BUTTON PRESSED =====');
    console.log('[PeopleWordCloud] Recall ID:', recallId);
    console.log('[PeopleWordCloud] Selected people count:', selectedPeople.length);
    console.log('[PeopleWordCloud] Selected people:', selectedPeople.map(p => p.person_name).join(', '));
    
    // If no recall ID, just pass data back via params (for new notes)
    if (!recallId) {
      console.log('[PeopleWordCloud] No recall ID - passing data back via params');
      const cleanedPeople = selectedPeople.map(p => ({
        id: p.id,
        person_name: p.person_name,
        photo_url: p.photo_url,
      }));
      
      router.setParams({
        selectedPeople: JSON.stringify(cleanedPeople),
        peopleUpdatedTimestamp: Date.now().toString(),
      });
      
      router.back();
      return;
    }

    // If we have a recall ID, update the database directly
    if (!user) {
      console.error('[PeopleWordCloud] ERROR: No user found, cannot save');
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setSaving(true);
      console.log('[PeopleWordCloud] ===== UPDATING DATABASE DIRECTLY =====');
      console.log('[PeopleWordCloud] User ID:', user.id);
      console.log('[PeopleWordCloud] Recall ID:', recallId);
      
      // Step 1: Delete ALL existing associations for this recall
      console.log('[PeopleWordCloud] Step 1: Deleting existing people associations');
      const { error: deleteError, count: deleteCount } = await supabase
        .from('recall_people')
        .delete()
        .eq('recall_id', recallId)
        .eq('user_id', user.id);
      
      if (deleteError) {
        console.error('[PeopleWordCloud] ❌ ERROR deleting existing people associations:', deleteError);
        console.error('[PeopleWordCloud] Delete error code:', deleteError.code);
        console.error('[PeopleWordCloud] Delete error message:', deleteError.message);
        console.error('[PeopleWordCloud] Delete error details:', JSON.stringify(deleteError, null, 2));
        throw new Error(`Failed to delete existing people: ${deleteError.message}`);
      } else {
        console.log('[PeopleWordCloud] ✅ Successfully deleted existing associations (count:', deleteCount, ')');
      }
      
      // Step 2: Insert new associations if there are any people selected
      if (selectedPeople.length > 0) {
        console.log('[PeopleWordCloud] Step 2: Inserting new people associations');
        
        // Validate that all people have valid IDs
        const invalidPeople = selectedPeople.filter(p => !p.id || typeof p.id !== 'string');
        if (invalidPeople.length > 0) {
          console.error('[PeopleWordCloud] ❌ ERROR: Found people with invalid IDs:', invalidPeople);
          throw new Error('Some people have invalid IDs');
        }
        
        // Prepare insert data
        const insertData = selectedPeople.map(person => ({
          recall_id: recallId,
          person_id: person.id,
          user_id: user.id,
        }));
        
        console.log('[PeopleWordCloud] Data to insert:', JSON.stringify(insertData, null, 2));
        
        // Try inserting all at once first
        const { data: insertedData, error: peopleError } = await supabase
          .from('recall_people')
          .insert(insertData)
          .select();
        
        if (peopleError) {
          console.error('[PeopleWordCloud] ❌ ERROR inserting people associations (batch):', peopleError);
          console.error('[PeopleWordCloud] Error code:', peopleError.code);
          console.error('[PeopleWordCloud] Error message:', peopleError.message);
          console.error('[PeopleWordCloud] Error hint:', peopleError.hint);
          console.error('[PeopleWordCloud] Error details:', JSON.stringify(peopleError, null, 2));
          console.error('[PeopleWordCloud] Failed insert data:', JSON.stringify(insertData, null, 2));
          
          // Try inserting one by one to identify which record is failing
          console.log('[PeopleWordCloud] Attempting individual inserts to identify failing record...');
          let successCount = 0;
          let failCount = 0;
          
          for (let i = 0; i < insertData.length; i++) {
            const singleRecord = insertData[i];
            console.log(`[PeopleWordCloud] Inserting record ${i + 1}/${insertData.length}:`, singleRecord);
            
            const { data: singleData, error: singleError } = await supabase
              .from('recall_people')
              .insert([singleRecord])
              .select();
            
            if (singleError) {
              console.error(`[PeopleWordCloud] ❌ Failed to insert record ${i + 1}:`, singleError);
              console.error(`[PeopleWordCloud] Failed record data:`, singleRecord);
              failCount++;
            } else {
              console.log(`[PeopleWordCloud] ✅ Successfully inserted record ${i + 1}`);
              successCount++;
            }
          }
          
          console.log(`[PeopleWordCloud] Individual insert results: ${successCount} succeeded, ${failCount} failed`);
          
          if (failCount > 0) {
            throw new Error(`Failed to insert ${failCount} out of ${selectedPeople.length} people associations`);
          }
        } else {
          console.log('[PeopleWordCloud] ✅ SUCCESS! Inserted', selectedPeople.length, 'people associations (batch)');
          console.log('[PeopleWordCloud] Inserted data:', JSON.stringify(insertedData, null, 2));
        }
      } else {
        console.log('[PeopleWordCloud] No people to save (empty selection)');
      }
      
      // Step 3: Verify the save by querying back
      console.log('[PeopleWordCloud] Step 3: Verifying saved people associations');
      const { data: verifyData, error: verifyError } = await supabase
        .from('recall_people')
        .select('id, recall_id, person_id, user_id, persons(id, person_name, photo_url)')
        .eq('recall_id', recallId)
        .eq('user_id', user.id);
      
      if (verifyError) {
        console.error('[PeopleWordCloud] ❌ ERROR verifying people associations:', verifyError);
      } else {
        console.log('[PeopleWordCloud] Verification: Found', verifyData?.length || 0, 'people associations in database');
        if (verifyData && verifyData.length > 0) {
          console.log('[PeopleWordCloud] Verified people:', verifyData.map((rp: any) => rp.persons?.person_name).join(', '));
          console.log('[PeopleWordCloud] Full verification data:', JSON.stringify(verifyData, null, 2));
        }
        
        // Check if the count matches
        if (verifyData && verifyData.length !== selectedPeople.length) {
          console.error('[PeopleWordCloud] ⚠️ WARNING: Mismatch in people count!');
          console.error('[PeopleWordCloud] Expected:', selectedPeople.length, 'Got:', verifyData.length);
          Alert.alert(
            'Warning',
            `Expected to save ${selectedPeople.length} people but only ${verifyData.length} were saved.`
          );
        } else {
          console.log('[PeopleWordCloud] ✅ People count matches! Expected and got:', selectedPeople.length);
        }
      }
      
      // Haptic feedback on success
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      console.log('[PeopleWordCloud] ===== SAVE COMPLETE =====');
      
      // Pass updated data back via params to trigger UI refresh
      const cleanedPeople = selectedPeople.map(p => ({
        id: p.id,
        person_name: p.person_name,
        photo_url: p.photo_url,
      }));
      
      router.setParams({
        selectedPeople: JSON.stringify(cleanedPeople),
        peopleUpdatedTimestamp: Date.now().toString(),
        databaseUpdated: 'true',
      });
      
      // Navigate back
      router.back();
    } catch (error: any) {
      console.error('[PeopleWordCloud] 🔥 CRITICAL ERROR saving people:', error);
      console.error('[PeopleWordCloud] Error stack:', error.stack);
      Alert.alert(
        'Error Saving People',
        `Failed to save people associations: ${error.message || 'Unknown error'}. Please try again.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    console.log('[PeopleWordCloud] Cancelling - navigating back without saving');
    router.back();
  };

  // Truncate name to 18 characters
  const truncateName = (name: string, maxLength: number = 18): string => {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength) + '...';
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Select People',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            color: colors.primary,
          },
          headerLeft: () => (
            <Pressable 
              onPress={handleCancel} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleSave}
              disabled={saving || !hasChanges()}
              style={[
                styles.saveButton,
                (saving || !hasChanges()) && styles.saveButtonDisabled,
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.checkmarkContainer}>
                  <IconSymbol name="checkmark" size={20} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          ),
        }}
      />

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
          <View style={styles.emptyIconContainer}>
            <IconSymbol name="person.2" size={64} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No People Yet</Text>
          <Text style={styles.emptyText}>
            People from your recalls will show up here
          </Text>
          <View style={styles.emptyTipsContainer}>
            <Text style={styles.emptyTipsTitle}>Smart people finder:</Text>
            <View style={styles.emptyTipsList}>
              <View style={styles.emptyTipItem}>
                <View style={styles.emptyTipNumber}>
                  <Text style={styles.emptyTipNumberText}>1</Text>
                </View>
                <Text style={styles.emptyTipText}>Mention a name in a Recall</Text>
              </View>

							<View style={styles.emptyTipItem}>
                <Text style={styles.emptyTipText}>OR</Text>
              </View>
							
              <View style={styles.emptyTipItem}>
                <View style={styles.emptyTipNumber}>
                  <Text style={styles.emptyTipNumberText}>2</Text>
                </View>
                <Text style={styles.emptyTipText}>Add images that have names in it</Text>
              </View>
            </View>
          </View>
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
                <PersonAvatar 
                  personName={person.person_name}
                  photoUrl={person.photo_url}
                  size={32}
                />
                <Text
                  style={[
                    styles.personName,
                    isSelected && styles.personNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {truncateName(person.person_name)}
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

      {/* Saving Modal */}
      {saving && (
        <View style={styles.savingModalContainer}>
          <View style={styles.savingModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.savingModalText}>Saving people...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
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
  saveButtonDisabled: {
    opacity: 0.4,
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
    paddingTop: 80,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.textTertiary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 280,
  },
  emptyTipsContainer: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  emptyTipsList: {
    gap: 16,
  },
  emptyTipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyTipNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTipNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyTipText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  wordCloudContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 8,
    marginHorizontal: 4,
  },
  personChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  personName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    maxWidth: 120,
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
  savingModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  savingModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  savingModalText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});
