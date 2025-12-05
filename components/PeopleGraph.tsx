
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Animated, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { PersonAvatar } from './PersonAvatar';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getMultiplePersonRecallCounts } from '@/utils/recallCounter';

interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
}

interface PeopleGraphProps {
  people: Person[];
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Constants for layout
const ROOT_NODE_SIZE = 50;
const PERSON_NODE_HEIGHT = 44;
const PERSON_NODE_MIN_WIDTH = 100;
const PERSON_NODE_PADDING = 16;
const MIN_RADIUS = 120; // Minimum distance from root
const MAX_RADIUS = 220; // Maximum distance from root
const EDGE_WIDTH = 2;
const MIN_NODE_SPACING = 60; // Minimum space between nodes to prevent overlap
const BADGE_SIZE = 24; // Size of the recall count badge

// Color palette for avatars (matching PersonAvatar)
const AVATAR_COLORS = [
  '#FF6B7A', '#FFAFAF', '#9E9093', '#FFD0D0', '#D4C7C8',
  '#FF8D92', '#FFF2F2', '#E86B77', '#FEC8C8', '#C7B7B9',
  '#9F9194', '#EFE8E8',
];

// Generate consistent color for a name
const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

// Calculate node width based on name length
const calculateNodeWidth = (name: string): number => {
  const charWidth = 8;
  const calculatedWidth = name.length * charWidth + PERSON_NODE_PADDING * 2;
  return Math.max(PERSON_NODE_MIN_WIDTH, Math.min(calculatedWidth, SCREEN_WIDTH * 0.6));
};

// Seeded random number generator for consistent randomization
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Check if two nodes overlap
const nodesOverlap = (
  x1: number,
  y1: number,
  width1: number,
  x2: number,
  y2: number,
  width2: number
): boolean => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDistance = (width1 + width2) / 2 + MIN_NODE_SPACING;
  return distance < minDistance;
};

// Calculate positions for person nodes with randomized distances and overlap prevention
const calculateNodePositions = (
  people: Person[]
) => {
  // Center the root node on the screen
  const centerX = SCREEN_WIDTH / 2;
  const centerY = SCREEN_HEIGHT / 2;

  const positions: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    x: number;
    y: number;
    color: string;
    width: number;
  }> = [];

  const count = people.length;
  const angleStep = (2 * Math.PI) / count;

  // First pass: calculate initial positions with randomized distances
  const tempPositions = people.map((person, index) => {
    // Calculate angle for this node (start from top and go clockwise)
    const angle = angleStep * index - Math.PI / 2;
    
    // Generate a seed based on person ID for consistent randomization
    const seed = person.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Randomize the radius between MIN_RADIUS and MAX_RADIUS
    const randomFactor = seededRandom(seed + index);
    const radius = MIN_RADIUS + randomFactor * (MAX_RADIUS - MIN_RADIUS);
    
    // Calculate position
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    // Get node width
    const width = calculateNodeWidth(person.person_name);

    return {
      id: person.id,
      name: person.person_name,
      photoUrl: person.photo_url || null,
      x,
      y,
      color: getAvatarColor(person.person_name),
      width,
      angle,
      radius,
    };
  });

  // Second pass: adjust positions to prevent overlaps
  const maxIterations = 50;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let hasOverlap = false;

    for (let i = 0; i < tempPositions.length; i++) {
      for (let j = i + 1; j < tempPositions.length; j++) {
        if (nodesOverlap(
          tempPositions[i].x,
          tempPositions[i].y,
          tempPositions[i].width,
          tempPositions[j].x,
          tempPositions[j].y,
          tempPositions[j].width
        )) {
          hasOverlap = true;

          // Push nodes apart
          const dx = tempPositions[j].x - tempPositions[i].x;
          const dy = tempPositions[j].y - tempPositions[i].y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDistance = (tempPositions[i].width + tempPositions[j].width) / 2 + MIN_NODE_SPACING;
          const pushDistance = (minDistance - distance) / 2;

          const pushX = (dx / distance) * pushDistance;
          const pushY = (dy / distance) * pushDistance;

          tempPositions[i].x -= pushX;
          tempPositions[i].y -= pushY;
          tempPositions[j].x += pushX;
          tempPositions[j].y += pushY;
        }
      }
    }

    if (!hasOverlap) {
      break;
    }
  }

  // Third pass: ensure nodes stay within screen bounds
  tempPositions.forEach((pos) => {
    const padding = 20;
    pos.x = Math.max(pos.width / 2 + padding, Math.min(SCREEN_WIDTH - pos.width / 2 - padding, pos.x));
    pos.y = Math.max(PERSON_NODE_HEIGHT / 2 + padding + 80, Math.min(SCREEN_HEIGHT - PERSON_NODE_HEIGHT / 2 - padding - 100, pos.y));

    positions.push({
      id: pos.id,
      name: pos.name,
      photoUrl: pos.photoUrl,
      x: pos.x,
      y: pos.y,
      color: pos.color,
      width: pos.width,
    });
  });

  return { positions, centerX, centerY };
};

export function PeopleGraph({ people, onClose }: PeopleGraphProps) {
  console.log('=== PeopleGraph Native Render ===');
  console.log('Platform:', Platform.OS);
  console.log('People count:', people.length);
  console.log('Screen dimensions:', { width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  const router = useRouter();
  const { user } = useAuth();

  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const graphScale = useRef(new Animated.Value(0.5)).current;
  const graphOpacity = useRef(new Animated.Value(0)).current;

  // Node positions and root position
  const [nodePositions, setNodePositions] = useState<Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    x: number;
    y: number;
    color: string;
    width: number;
  }>>([]);
  const [rootPosition, setRootPosition] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });
  const [recallCounts, setRecallCounts] = useState<{ [personId: string]: number }>({});

  // Load recall counts for each person using the standalone function
  useEffect(() => {
    const loadRecallCounts = async () => {
      if (!user || people.length === 0) return;

      try {
        const counts = await getMultiplePersonRecallCounts(people, user.id);
        setRecallCounts(counts);
      } catch (error) {
        console.error('Error loading recall counts:', error);
      }
    };

    loadRecallCounts();
  }, [people, user]);

  // Calculate positions on mount and trigger haptic feedback
  useEffect(() => {
    console.log('[PeopleGraph] Calculating node positions...');
    const { positions, centerX, centerY } = calculateNodePositions(people);
    console.log('[PeopleGraph] Calculated positions:', positions);
    console.log('[PeopleGraph] Root position:', { x: centerX, y: centerY });
    setNodePositions(positions);
    setRootPosition({ x: centerX, y: centerY });

    // Trigger heavy haptic feedback when graph loads
    console.log('[PeopleGraph] Graph loaded - triggering heavy haptic feedback');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Animate in
    console.log('[PeopleGraph] Starting entrance animation');
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(graphScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(graphOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      console.log('[PeopleGraph] Entrance animation complete');
    });
  }, [people]);

  const handleClose = () => {
    console.log('[PeopleGraph] Closing graph - starting exit animation');
    
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(graphScale, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(graphOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      console.log('[PeopleGraph] Exit animation complete, calling onClose');
      onClose();
    });
  };

  const handleRootPress = () => {
    console.log('[PeopleGraph] Root node pressed - collapsing graph');
    handleClose();
  };

  const handlePersonPress = (personId: string, personName: string) => {
    console.log('[PeopleGraph] Person node pressed:', personName);
    
    // Close the graph first
    handleClose();
    
    // Navigate to person recalls screen after a short delay
    setTimeout(() => {
      router.push(`/person-recalls?personId=${personId}`);
    }, 300);
  };

  // Render edges from root to each person node
  const renderEdges = () => {
    return nodePositions.map((node) => {
      const dx = node.x - rootPosition.x;
      const dy = node.y - rootPosition.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      return (
        <View
          key={`edge-${node.id}`}
          style={[
            styles.edge,
            {
              width: length,
              left: rootPosition.x,
              top: rootPosition.y,
              transform: [{ rotate: `${angle}deg` }],
            },
          ]}
        />
      );
    });
  };

  console.log('[PeopleGraph] Rendering with', nodePositions.length, 'nodes');

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Graph content */}
      <Animated.View
        style={[
          styles.graphContainer,
          {
            opacity: graphOpacity,
            transform: [{ scale: graphScale }],
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Edges layer */}
        <View style={styles.edgesLayer} pointerEvents="none">
          {renderEdges()}
        </View>

        {/* Nodes layer */}
        <View style={styles.nodesLayer} pointerEvents="box-none">
          {/* Root node - centered on screen */}
          <Pressable
            onPress={handleRootPress}
            style={[
              styles.rootNode,
              {
                left: rootPosition.x - ROOT_NODE_SIZE / 2,
                top: rootPosition.y - ROOT_NODE_SIZE / 2,
              },
            ]}
          >
            <IconSymbol
              name="person.2.fill"
              size={30}
              color="#FFFFFF"
            />
          </Pressable>

          {/* Person nodes */}
          {nodePositions.map((node) => {
            const recallCount = recallCounts[node.id] || 0;
            const showBadge = recallCount > 1;

            return (
              <Pressable
                key={node.id}
                onPress={() => handlePersonPress(node.id, node.name)}
                style={[
                  styles.personNode,
                  {
                    left: node.x - node.width / 2,
                    top: node.y - PERSON_NODE_HEIGHT / 2,
                    width: node.width,
                  },
                ]}
              >
                <View style={styles.personNodeContent}>
                  <PersonAvatar 
                    personName={node.name}
                    photoUrl={node.photoUrl}
                    size={32}
                    style={styles.personAvatar}
                  />
                  <Text style={styles.personName} numberOfLines={1}>
                    {node.name}
                  </Text>
                </View>
                
                {/* Recall count badge */}
                {showBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{recallCount}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
    elevation: 999999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  graphContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000000,
    elevation: 1000000,
  },
  edgesLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  edge: {
    position: 'absolute',
    height: EDGE_WIDTH,
    backgroundColor: colors.primary,
    opacity: 0.6,
    transformOrigin: 'left center',
  },
  nodesLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  rootNode: {
    position: 'absolute',
    width: ROOT_NODE_SIZE,
    height: ROOT_NODE_SIZE,
    borderRadius: ROOT_NODE_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.7,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  personNode: {
    position: 'absolute',
    height: PERSON_NODE_HEIGHT,
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  personNodeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  personAvatar: {
    // No additional styles needed
  },
  personName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
