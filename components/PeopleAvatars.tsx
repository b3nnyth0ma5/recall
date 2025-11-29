
import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { PersonAvatar } from './PersonAvatar';
import { colors } from '@/styles/commonStyles';
import { usePeopleGraph } from '@/contexts/PeopleGraphContext';

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
  maxVisible = 5, 
  avatarSize = 40,
  overlapOffset = 10,
}: PeopleAvatarsProps) {
  const { openGraph } = usePeopleGraph();
  const containerRef = useRef<View>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  if (!people || people.length === 0) {
    return null;
  }

  const visiblePeople = people.slice(0, maxVisible - 1);
  const remainingCount = people.length - visiblePeople.length;
  const showRemainingCount = remainingCount > 1;

  const handlePress = () => {
    // Only show graph if there's more than one person
    if (people.length <= 1) {
      console.log('Only one person, not showing graph');
      return;
    }

    // Animate press
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Measure position of the container
    if (containerRef.current) {
      containerRef.current.measure((x, y, width, height, pageX, pageY) => {
        console.log('Avatar container position:', { pageX, pageY, width, height });
        
        // Set anchor position to the center of the avatar container
        openGraph(people, {
          x: pageX + width / 2,
          y: pageY + height / 2,
        });
      });
    }
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View 
        ref={containerRef}
        style={[
          styles.container,
          {
            transform: [{ scale: scaleAnim }],
          }
        ]}
      >
        {visiblePeople.map((person, index) => (
          <PersonAvatar
            key={person.id}
            personName={person.person_name}
            size={avatarSize}
            style={[
              styles.avatar,
              { 
                marginLeft: index > 0 ? -overlapOffset : 0,
                zIndex: 1000 + (visiblePeople.length - index),
                elevation: 10 + (visiblePeople.length - index),
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
                zIndex: 1000,
                elevation: 10,
              }
            ]}
          >
            <Text style={[styles.remainingText, { fontSize: avatarSize * 0.4 }]}>
              +{remainingCount}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
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
