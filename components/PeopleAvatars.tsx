
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PersonAvatar } from './PersonAvatar';
import { colors } from '@/styles/commonStyles';

interface Person {
  id: string;
  person_name: string;
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
  avatarSize = 28,
  overlapOffset = 10,
}: PeopleAvatarsProps) {
  if (!people || people.length === 0) {
    return null;
  }

  const visiblePeople = people.slice(0, maxVisible - 1);
  const remainingCount = people.length - visiblePeople.length;
  const showRemainingCount = remainingCount > 1;

  return (
    <View style={styles.container}>
      {visiblePeople.map((person, index) => (
        <PersonAvatar
          key={person.id}
          personName={person.person_name}
          size={avatarSize}
          style={[
            styles.avatar,
            { 
              marginLeft: index > 0 ? -overlapOffset : 0,
              zIndex: visiblePeople.length - index,
            }
          ]}
        />
      ))}
      
      {showRemainingCount && (
        <View 
          style={[
            styles.remainingAvatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              marginLeft: -overlapOffset,
              zIndex: 0,
            }
          ]}
        >
          <Text style={[styles.remainingText, { fontSize: avatarSize * 0.35 }]}>
            +{remainingCount}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    // Individual avatar styles handled in PersonAvatar component
  },
  remainingAvatar: {
    backgroundColor: colors.cardDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  remainingText: {
    color: colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
});
