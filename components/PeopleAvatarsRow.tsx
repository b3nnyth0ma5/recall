
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PersonAvatarWithTooltip } from './PersonAvatarWithTooltip';
import { colors } from '@/styles/commonStyles';

interface Person {
  id: string;
  person_name: string;
}

interface PeopleAvatarsRowProps {
  people: Person[];
  avatarSize?: number;
}

export function PeopleAvatarsRow({ 
  people, 
  avatarSize = 44,
}: PeopleAvatarsRowProps) {
  if (!people || people.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarsRow}>
        {people.map((person, index) => (
          <PersonAvatarWithTooltip
            key={person.id}
            personName={person.person_name}
            size={avatarSize}
            style={[
              styles.avatar,
              index > 0 && { marginLeft: 8 }
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  avatar: {
    // Individual avatar styles handled in PersonAvatar component
  },
});
