
import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { PersonAvatar } from './PersonAvatar';
import { IconSymbol } from './IconSymbol';
import { PeopleWordCloud } from './PeopleWordCloud';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
}

interface PeopleAvatarsRowProps {
  people: Person[];
  avatarSize?: number;
  onPeopleChange?: (people: Person[]) => void;
  recallId?: string;
}

export function PeopleAvatarsRow({ 
  people, 
  avatarSize = 44,
  onPeopleChange,
  recallId,
}: PeopleAvatarsRowProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [showWordCloud, setShowWordCloud] = useState(false);

  const handleAddPeople = () => {
    console.log('[PeopleAvatarsRow] Opening word cloud');
    setShowWordCloud(true);
  };

  const handleSavePeople = async (selectedPeople: Person[]) => {
    console.log('[PeopleAvatarsRow] ===== SAVING PEOPLE =====');
    console.log('[PeopleAvatarsRow] Selected people:', selectedPeople);
    console.log('[PeopleAvatarsRow] Recall ID:', recallId);
    console.log('[PeopleAvatarsRow] User ID:', user?.id);

    // Update local state immediately
    if (onPeopleChange) {
      onPeopleChange(selectedPeople);
    }

    // If we have a recallId (editing existing note), save to database
    if (recallId && user) {
      try {
        console.log('[PeopleAvatarsRow] Saving people associations to database');

        // Delete existing associations
        const { error: deleteError } = await supabase
          .from('recall_people')
          .delete()
          .eq('recall_id', recallId)
          .eq('user_id', user.id);

        if (deleteError) {
          console.error('[PeopleAvatarsRow] Error deleting existing associations:', deleteError);
          throw deleteError;
        }

        console.log('[PeopleAvatarsRow] Deleted existing associations');

        // Insert new associations
        if (selectedPeople.length > 0) {
          const insertData = selectedPeople.map(person => ({
            recall_id: recallId,
            person_id: person.id,
            user_id: user.id,
          }));

          console.log('[PeopleAvatarsRow] Inserting new associations:', insertData);

          const { data: insertedData, error: insertError } = await supabase
            .from('recall_people')
            .insert(insertData)
            .select();

          if (insertError) {
            console.error('[PeopleAvatarsRow] Error inserting associations:', insertError);
            throw insertError;
          }

          console.log('[PeopleAvatarsRow] Successfully inserted associations:', insertedData);
        }
      } catch (error) {
        console.error('[PeopleAvatarsRow] Error managing people associations:', error);
      }
    } else {
      console.log('[PeopleAvatarsRow] No recallId, skipping database save (will be saved on note save)');
    }
  };

  const handlePersonPress = (personId: string) => {
    console.log('[PeopleAvatarsRow] Person pressed:', personId);
    router.push(`/person-recalls?personId=${personId}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatarsContainer}>
        {/* Plus icon - leftmost */}
        <Pressable
          onPress={handleAddPeople}
          style={[
            styles.addButton,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
            },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="plus" size={avatarSize * 0.5} color={colors.primary} />
        </Pressable>

        {/* People avatars */}
        {people.map((person) => (
          <Pressable
            key={person.id}
            onPress={() => handlePersonPress(person.id)}
            style={styles.avatarWrapper}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <PersonAvatar
              personName={person.person_name}
              photoUrl={person.photo_url}
              size={avatarSize}
            />
          </Pressable>
        ))}
      </View>

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
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  avatarWrapper: {
    // No additional styles needed
  },
  addButton: {
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
});
