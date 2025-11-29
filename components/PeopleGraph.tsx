
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Animated, Platform } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface Person {
  id: string;
  person_name: string;
}

interface PeopleGraphProps {
  people: Person[];
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Constants for layout
const ROOT_NODE_SIZE = 56;
const PERSON_NODE_HEIGHT = 44;
const PERSON_NODE_MIN_WIDTH = 100;
const PERSON_NODE_PADDING = 16;
const RADIUS_FROM_ROOT = 140; // Distance from root to person nodes
const EDGE_WIDTH = 2;

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

// Calculate positions for person nodes in a circle around root
const calculateNodePositions = (
  people: Person[],
  anchorX: number,
  anchorY: number
) => {
  const positions: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    color: string;
    width: number;
  }> = [];

  const count = people.length;
  const angleStep = (2 * Math.PI) / count;

  people.forEach((person, index) => {
    // Calculate angle for this node (start from top and go clockwise)
    const angle = angleStep * index - Math.PI / 2;
    
    // Calculate position
    let x = anchorX + Math.cos(angle) * RADIUS_FROM_ROOT;
    let y = anchorY + Math.sin(angle) * RADIUS_FROM_ROOT;

    // Get node width
    const width = calculateNodeWidth(person.person_name);

    // Ensure node stays within screen bounds
    const padding = 20;
    x = Math.max(width / 2 + padding, Math.min(SCREEN_WIDTH - width / 2 - padding, x));
    y = Math.max(PERSON_NODE_HEIGHT / 2 + padding + 80, Math.min(SCREEN_HEIGHT - PERSON_NODE_HEIGHT / 2 - padding - 100, y));

    positions.push({
      id: person.id,
      name: person.person_name,
      x,
      y,
      color: getAvatarColor(person.person_name),
      width,
    });
  });

  return positions;
};

export function PeopleGraph({ people, onClose, anchorPosition }: PeopleGraphProps) {
  console.log('=== PeopleGraph Native Render ===');
  console.log('Platform:', Platform.OS);
  console.log('People count:', people.length);
  console.log('Anchor position:', anchorPosition);
  console.log('Screen dimensions:', { width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const graphScale = useRef(new Animated.Value(0.5)).current;
  const graphOpacity = useRef(new Animated.Value(0)).current;

  // Node positions
  const [nodePositions, setNodePositions] = useState<Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    color: string;
    width: number;
  }>>([]);

  // Calculate positions on mount
  useEffect(() => {
    console.log('[PeopleGraph] Calculating node positions...');
    const positions = calculateNodePositions(people, anchorPosition.x, anchorPosition.y);
    console.log('[PeopleGraph] Calculated positions:', positions);
    setNodePositions(positions);

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
  }, [people, anchorPosition]);

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

  // Render edges from root to each person node
  const renderEdges = () => {
    return nodePositions.map((node, index) => {
      const dx = node.x - anchorPosition.x;
      const dy = node.y - anchorPosition.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      return (
        <View
          key={`edge-${node.id}`}
          style={[
            styles.edge,
            {
              width: length,
              left: anchorPosition.x,
              top: anchorPosition.y,
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

      {/* Close button */}
      <View style={styles.closeButtonContainer} pointerEvents="box-none">
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <View style={styles.closeButtonInner}>
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={32}
              color="#FFFFFF"
            />
          </View>
        </Pressable>
      </View>

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
          {/* Root node */}
          <Pressable
            onPress={handleRootPress}
            style={[
              styles.rootNode,
              {
                left: anchorPosition.x - ROOT_NODE_SIZE / 2,
                top: anchorPosition.y - ROOT_NODE_SIZE / 2,
              },
            ]}
          >
            <IconSymbol
              ios_icon_name="person.3.fill"
              android_material_icon_name="group"
              size={30}
              color="#FFFFFF"
            />
          </Pressable>

          {/* Person nodes */}
          {nodePositions.map((node) => (
            <View
              key={node.id}
              style={[
                styles.personNode,
                {
                  left: node.x - node.width / 2,
                  top: node.y - PERSON_NODE_HEIGHT / 2,
                  width: node.width,
                  backgroundColor: node.color,
                },
              ]}
            >
              <Text style={styles.personName} numberOfLines={1}>
                {node.name}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Debug overlay (only in development) */}
      {__DEV__ && (
        <View style={styles.debugOverlay} pointerEvents="none">
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>Platform: {Platform.OS}</Text>
            <Text style={styles.debugText}>People: {people.length}</Text>
            <Text style={styles.debugText}>Nodes: {nodePositions.length}</Text>
            <Text style={styles.debugText}>
              Anchor: ({Math.round(anchorPosition.x)}, {Math.round(anchorPosition.y)})
            </Text>
          </View>
        </View>
      )}
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
  closeButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 1000001,
    elevation: 1000001,
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingRight: 20,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonInner: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    padding: 6,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
      },
      android: {
        elevation: 12,
      },
    }),
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
    paddingHorizontal: PERSON_NODE_PADDING,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#776C6E',
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
  personName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4E4749',
    textAlign: 'center',
  },
  debugOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    left: 20,
    zIndex: 1000002,
    elevation: 1000002,
  },
  debugInfo: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  debugText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
});
