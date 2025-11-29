
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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
  avatarSize = 40,
}: PeopleAvatarsRowProps) {
  if (!people || people.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.avatarsRow}
        style={styles.scrollView}
      >
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 0,
  },
  scrollView: {
    flexGrow: 0,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    // Individual avatar styles handled in PersonAvatar component
  },
});
