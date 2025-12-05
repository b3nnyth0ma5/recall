
import React from 'react';
import { View, StyleSheet } from 'react-native';
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
  if (!people || people.length === 0) {
    return null;
  }

  const visiblePeople = people.slice(0, maxVisible);
  const remainingCount = people.length - maxVisible;

  return (
    <View style={styles.container}>
      {visiblePeople.map((person, index) => (
        <View
          key={person.id}
          style={[
            styles.avatarWrapper,
            {
              marginLeft: index > 0 ? -overlapOffset : 0,
              zIndex: visiblePeople.length - index,
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
              zIndex: 0,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  moreAvatar: {
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.25,
    borderColor: '#776C6E',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.2)',
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
