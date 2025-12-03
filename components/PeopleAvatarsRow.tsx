
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { PersonAvatar } from './PersonAvatar';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMultiplePersonRecallCounts } from '@/utils/recallCounter';
import { IconSymbol } from './IconSymbol';
import { supabase } from '@/utils/supabase';

interface Person {
  id: string;
  person_name: string;
}

interface PeopleAvatarsRowProps {
  people: Person[];
  avatarSize?: number;
  onPeopleChange?: (people: Person[]) => void;
  recallId?: string;
}

export function PeopleAvatarsRow({ 
  people, 
  avatarSize = 40,
  onPeopleChange,
  recallId,
}: PeopleAvatarsRowProps) {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [recallCounts, setRecallCounts] = useState<{ [personId: string]: number }>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (people && people.length > 0 && user) {
      loadRecallCounts();
    }
  }, [people, user]);

  // Handle selected people coming back from the word cloud screen
  useEffect(() => {
    console.log('[PeopleAvatarsRow] Params changed:', {
      hasSelectedPeople: !!params.selectedPeople,
      hasTimestamp: !!params.peopleUpdatedTimestamp,
      timestamp: params.peopleUpdatedTimestamp,
      databaseUpdated: params.databaseUpdated,
    });

    if (params.selectedPeople && params.peopleUpdatedTimestamp) {
      try {
        const selectedPeople = JSON.parse(params.selectedPeople as string);
        console.log('[PeopleAvatarsRow] ===== RECEIVED PEOPLE FROM WORD CLOUD =====');
        console.log('[PeopleAvatarsRow] Selected people count:', selectedPeople.length);
        console.log('[PeopleAvatarsRow] Selected people:', selectedPeople.map((p: Person) => p.person_name).join(', '));
        console.log('[PeopleAvatarsRow] Full data:', selectedPeople);
        console.log('[PeopleAvatarsRow] Database was updated:', params.databaseUpdated === 'true');
        
        // If database was updated, fetch fresh data from database
        if (params.databaseUpdated === 'true' && recallId && user) {
          console.log('[PeopleAvatarsRow] Fetching fresh data from database for recall:', recallId);
          refreshPeopleFromDatabase();
        } else {
          // Otherwise, just update the local state
          if (onPeopleChange) {
            console.log('[PeopleAvatarsRow] Calling onPeopleChange with selected people');
            onPeopleChange(selectedPeople);
            console.log('[PeopleAvatarsRow] onPeopleChange called successfully');
          } else {
            console.warn('[PeopleAvatarsRow] onPeopleChange callback is not defined!');
          }
        }
        
        // Clear the params to prevent re-triggering
        console.log('[PeopleAvatarsRow] Clearing router params');
        router.setParams({ 
          selectedPeople: undefined,
          peopleUpdatedTimestamp: undefined,
          databaseUpdated: undefined,
        });
      } catch (error) {
        console.error('[PeopleAvatarsRow] Error parsing selected people:', error);
      }
    }
  }, [params.selectedPeople, params.peopleUpdatedTimestamp, params.databaseUpdated, onPeopleChange, router, recallId, user]);

  const refreshPeopleFromDatabase = async () => {
    if (!recallId || !user) {
      console.log('[PeopleAvatarsRow] Cannot refresh - missing recallId or user');
      return;
    }

    try {
      setIsRefreshing(true);
      console.log('[PeopleAvatarsRow] ===== REFRESHING PEOPLE FROM DATABASE =====');
      console.log('[PeopleAvatarsRow] Recall ID:', recallId);
      console.log('[PeopleAvatarsRow] User ID:', user.id);

      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('person_id, persons(id, person_name)')
        .eq('recall_id', recallId)
        .eq('user_id', user.id);

      if (recallPeopleError) {
        console.error('[PeopleAvatarsRow] ❌ ERROR fetching people from database:', recallPeopleError);
        return;
      }

      console.log('[PeopleAvatarsRow] Fetched recall_people data:', recallPeopleData);

      if (recallPeopleData && recallPeopleData.length > 0) {
        const freshPeople: Person[] = recallPeopleData
          .filter((rp: any) => rp.persons)
          .map((rp: any) => ({
            id: rp.persons.id,
            person_name: rp.persons.person_name,
          }));

        console.log('[PeopleAvatarsRow] ✅ Fetched', freshPeople.length, 'people from database');
        console.log('[PeopleAvatarsRow] Fresh people:', freshPeople.map(p => p.person_name).join(', '));

        if (onPeopleChange) {
          console.log('[PeopleAvatarsRow] Calling onPeopleChange with fresh data');
          onPeopleChange(freshPeople);
          console.log('[PeopleAvatarsRow] onPeopleChange called successfully');
        }
      } else {
        console.log('[PeopleAvatarsRow] No people found in database for this recall');
        if (onPeopleChange) {
          onPeopleChange([]);
        }
      }
    } catch (error) {
      console.error('[PeopleAvatarsRow] 🔥 ERROR refreshing people from database:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadRecallCounts = async () => {
    if (!user) return;

    const counts = await getMultiplePersonRecallCounts(people, user.id);
    setRecallCounts(counts);
  };

  const handlePersonPress = (person: Person) => {
    console.log('[PeopleAvatarsRow] Person avatar clicked:', person.person_name);
    router.push(`/person-recalls?personId=${person.id}`);
  };

  const handleAddPeoplePress = () => {
    console.log('[PeopleAvatarsRow] ===== ADD PEOPLE BUTTON CLICKED =====');
    console.log('[PeopleAvatarsRow] Current people count:', people.length);
    console.log('[PeopleAvatarsRow] Current people:', people.map(p => p.person_name).join(', '));
    console.log('[PeopleAvatarsRow] Recall ID:', recallId);
    console.log('[PeopleAvatarsRow] Navigating to word cloud with initial selection');
    
    router.push({
      pathname: '/people-word-cloud',
      params: {
        initialSelectedPeople: JSON.stringify(people),
        recallId: recallId || undefined,
      },
    });
  };

  console.log('[PeopleAvatarsRow] Rendering with', people.length, 'people', isRefreshing ? '(refreshing...)' : '');

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.avatarsRow}
        style={styles.scrollView}
      >
        {/* Add People Placeholder Avatar */}
        <Pressable
          onPress={handleAddPeoplePress}
          style={styles.avatarContainer}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={[
            styles.addPeopleAvatar, 
            { width: avatarSize, height: avatarSize }
          ]}>
            <IconSymbol 
              name="person.badge.plus" 
              size={avatarSize * 0.5} 
              color={colors.primary} 
            />
          </View>
        </Pressable>

        {people.map((person, index) => (
          <Pressable
            key={person.id}
            onPress={() => handlePersonPress(person)}
            style={[
              styles.avatarContainer,
              { marginLeft: 8 }
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <PersonAvatar
              personName={person.person_name}
              size={avatarSize}
            />
            {recallCounts[person.id] !== undefined && recallCounts[person.id] > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{recallCounts[person.id]}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    minHeight: 70,
    zIndex: 1000,
    elevation: 1000,
  },
  scrollView: {
    flexGrow: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  avatarContainer: {
    position: 'relative',
    zIndex: 1000,
    elevation: 1000,
  },
  addPeopleAvatar: {
    borderRadius: 100,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.background,
    zIndex: 2000,
    elevation: 2000,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
