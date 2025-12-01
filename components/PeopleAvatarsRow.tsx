
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { PersonAvatar } from './PersonAvatar';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMultiplePersonRecallCounts } from '@/utils/recallCounter';
import { IconSymbol } from './IconSymbol';

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

  useEffect(() => {
    if (people && people.length > 0 && user) {
      loadRecallCounts();
    }
  }, [people, user]);

  // Handle selected people coming back from the word cloud screen
  useEffect(() => {
    if (params.selectedPeople && params.peopleUpdatedTimestamp) {
      try {
        const selectedPeople = JSON.parse(params.selectedPeople as string);
        console.log('[PeopleAvatarsRow] Received selected people from word cloud:', selectedPeople);
        
        // Always call onPeopleChange to update the parent component's state
        if (onPeopleChange) {
          onPeopleChange(selectedPeople);
          console.log('[PeopleAvatarsRow] Updated parent component with selected people');
        }
        
        // Clear the params to prevent re-triggering
        router.setParams({ 
          selectedPeople: undefined,
          peopleUpdatedTimestamp: undefined,
        });
      } catch (error) {
        console.error('[PeopleAvatarsRow] Error parsing selected people:', error);
      }
    }
  }, [params.selectedPeople, params.peopleUpdatedTimestamp]);

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
    console.log('[PeopleAvatarsRow] Add people button clicked - navigating to word cloud');
    router.push({
      pathname: '/people-word-cloud',
      params: {
        initialSelectedPeople: JSON.stringify(people),
      },
    });
  };

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
  },
  scrollView: {
    flexGrow: 0,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
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
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
