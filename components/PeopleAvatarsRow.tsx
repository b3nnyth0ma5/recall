
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { PersonAvatar } from './PersonAvatar';
import { PeopleWordCloud } from './PeopleWordCloud';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
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
  const [recallCounts, setRecallCounts] = useState<{ [personId: string]: number }>({});
  const [showWordCloud, setShowWordCloud] = useState(false);

  useEffect(() => {
    if (people && people.length > 0 && user) {
      loadRecallCounts();
    }
  }, [people, user]);

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
    console.log('[PeopleAvatarsRow] Add people button clicked');
    setShowWordCloud(true);
  };

  const handleSavePeople = async (selectedPeople: Person[]) => {
    console.log('[PeopleAvatarsRow] Saving selected people:', selectedPeople);
    
    if (onPeopleChange) {
      onPeopleChange(selectedPeople);
    }
    
    // If we have a recallId, update the recall_people table
    if (recallId && user) {
      try {
        const { supabase } = await import('@/utils/supabase');
        
        // Delete existing associations
        await supabase
          .from('recall_people')
          .delete()
          .eq('recall_id', recallId)
          .eq('user_id', user.id);
        
        // Insert new associations
        if (selectedPeople.length > 0) {
          const insertData = selectedPeople.map(person => ({
            recall_id: recallId,
            person_id: person.id,
            user_id: user.id,
          }));
          
          const { error } = await supabase
            .from('recall_people')
            .insert(insertData);
          
          if (error) {
            console.error('Error updating recall_people:', error);
          } else {
            console.log(`Updated recall_people for recall ${recallId}`);
          }
        }
      } catch (error) {
        console.error('Error saving people associations:', error);
      }
    }
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
          <View style={[styles.addPeopleAvatar, { width: avatarSize, height: avatarSize }]}>
            <IconSymbol name="person.badge.plus" size={avatarSize * 0.5} color={colors.primary} />
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

      <PeopleWordCloud
        visible={showWordCloud}
        onClose={() => setShowWordCloud(false)}
        onSave={handleSavePeople}
        initialSelectedPeople={people}
      />
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
