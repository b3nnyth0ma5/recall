
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { PersonAvatar } from './PersonAvatar';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { getMultiplePersonRecallCounts } from '@/utils/recallCounter';

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
  const { user } = useAuth();
  const router = useRouter();
  const [recallCounts, setRecallCounts] = useState<{ [personId: string]: number }>({});

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
          <Pressable
            key={person.id}
            onPress={() => handlePersonPress(person)}
            style={[
              styles.avatarContainer,
              index > 0 && { marginLeft: 8 }
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
    minHeight: 64,
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
