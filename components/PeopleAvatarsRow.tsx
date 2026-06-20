
import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { PersonAvatar } from './PersonAvatar';
import { IconSymbol } from './IconSymbol';

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

  const handleAddPeople = () => {
    console.log('[PeopleAvatarsRow] Opening people word cloud screen');
    console.log('[PeopleAvatarsRow] Recall ID:', recallId);
    console.log('[PeopleAvatarsRow] Current people:', people);
    
    // Navigate to people-word-cloud screen with initial selected people
    const params: any = {};
    
    if (people && people.length > 0) {
      params.initialSelectedPeople = JSON.stringify(people);
    }
    
    if (recallId) {
      params.recallId = recallId;
    }
    
    console.log('[PeopleAvatarsRow] Navigation params:', params);
    
    // Navigate to the people-word-cloud screen
    router.push({
      pathname: '/people-word-cloud',
      params,
    });
  };

  const handlePersonPress = (personId: string) => {
    console.log('[PeopleAvatarsRow] Person pressed:', personId);
    router.push(`/person-recalls?personId=${personId}`);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
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
          <IconSymbol name="person.crop.circle.badge.plus" size={avatarSize * 0.6} color={colors.primary} />
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
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
    borderStyle: 'solid',
  },
});
