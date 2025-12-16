
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { PersonAvatar } from './PersonAvatar';

interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
}

interface PeopleAvatarsProps {
  people: Person[];
  maxVisible?: number;
  avatarSize?: number;
  overlapOffset?: number;
}

export function PeopleAvatars({ 
  people, 
  maxVisible = 3, 
  avatarSize = 40,
  overlapOffset = 12,
}: PeopleAvatarsProps) {
  const router = useRouter();

  if (!people || people.length === 0) {
    return null;
  }

  const handlePress = () => {
    console.log('[PeopleAvatars] Clicked with', people.length, 'people');
    
    if (people.length === 1) {
      // Navigate to person-recalls screen for single person
      console.log('[PeopleAvatars] Navigating to person-recalls for:', people[0].person_name);
      router.push(`/person-recalls?personId=${people[0].id}`);
    } else {
      // Navigate to PeopleGraph for multiple people
      console.log('[PeopleAvatars] Navigating to PeopleGraph for multiple people');
      // We'll need to pass the people data through a context or state management
      // For now, we'll use the transparent-modal route with people data
      const peopleIds = people.map(p => p.id).join(',');
      router.push(`/transparent-modal?peopleIds=${peopleIds}`);
    }
  };

  const visiblePeople = people.slice(0, maxVisible);
  const remainingCount = people.length - maxVisible;

  return (
    <Pressable 
      onPress={handlePress}
      style={styles.container}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {visiblePeople.map((person, index) => (
        <View
          key={person.id}
          style={[
            styles.avatarWrapper,
            {
              marginLeft: index > 0 ? -overlapOffset : 0,
              zIndex: visiblePeople.length - index + 100,
              elevation: visiblePeople.length - index + 100,
            },
          ]}
        >
          <PersonAvatar
            personName={person.person_name}
            photoUrl={person.photo_url}
            size={avatarSize}
          />
        </View>
      ))}
      {remainingCount > 0 && (
        <View
          style={[
            styles.avatarWrapper,
            {
              marginLeft: -overlapOffset,
              zIndex: 100,
              elevation: 100,
            },
          ]}
        >
          <View
            style={[
              styles.moreAvatar,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
              },
            ]}
          >
            <View style={styles.moreText}>
              <View style={styles.plusSign} />
              <View style={[styles.plusSign, styles.plusSignVertical]} />
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  avatarWrapper: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
  moreAvatar: {
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  moreText: {
    position: 'relative',
    width: 16,
    height: 16,
  },
  plusSign: {
    position: 'absolute',
    backgroundColor: '#4E4749',
    width: 12,
    height: 2,
    top: 7,
    left: 2,
  },
  plusSignVertical: {
    width: 2,
    height: 12,
    top: 2,
    left: 7,
  },
});
