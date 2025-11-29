
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Animated, Platform } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface Person {
  id: string;
  person_name: string;
}

interface GraphNode {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  vx: number;
  vy: number;
  isRoot: boolean;
}

interface PeopleGraphProps {
  people: Person[];
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const NODE_HEIGHT = 40;
const NODE_MIN_WIDTH = 120;
const NODE_PADDING = 16;
const ROOT_NODE_SIZE = 50;
const EDGE_LENGTH = 150; // Increased from 120 for more separation
const REPULSION_STRENGTH = 8000; // Increased from 5000 for more separation
const ATTRACTION_STRENGTH = 0.06; // Decreased from 0.08 for more flexibility
const DAMPING = 0.7; // Decreased from 0.75 for more movement
const ITERATIONS = 200; // Increased from 150 for better convergence

// Generate a consistent color based on the name (same as PersonAvatar)
const getAvatarColor = (name: string): string => {
  const colorPalette = [
    '#FF6B7A', '#FFAFAF', '#9E9093', '#FFD0D0', '#D4C7C8',
    '#FF8D92', '#FFF2F2', '#E86B77', '#FEC8C8', '#C7B7B9',
    '#9F9194', '#EFE8E8',
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colorPalette.length;
  return colorPalette[index];
};

// Calculate node width based on name length
const calculateNodeWidth = (name: string): number => {
  const charWidth = 9;
  const calculatedWidth = name.length * charWidth + NODE_PADDING * 2;
  return Math.max(NODE_MIN_WIDTH, Math.min(calculatedWidth, SCREEN_WIDTH * 0.7));
};

// Seeded random number generator for consistent randomization
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Force-directed layout algorithm with improved separation and randomization
const calculateLayout = (
  people: Person[],
  anchorPosition: { x: number; y: number }
): GraphNode[] => {
  // Create root node (people icon placeholder)
  const rootNode: GraphNode = {
    id: 'root',
    name: 'People',
    x: anchorPosition.x,
    y: anchorPosition.y,
    color: colors.primary,
    vx: 0,
    vy: 0,
    isRoot: true,
  };

  // Initialize person nodes with randomized positions around the root
  const personNodes: GraphNode[] = people.map((person, index) => {
    // Base angle with even distribution
    const baseAngle = (index / people.length) * 2 * Math.PI;
    
    // Add randomization to angle (±30 degrees)
    const seed = person.id.charCodeAt(0) + index;
    const angleVariation = (seededRandom(seed) - 0.5) * (Math.PI / 3);
    const angle = baseAngle + angleVariation;
    
    // Randomize radius between 1.2x and 2.0x of EDGE_LENGTH
    const radiusVariation = seededRandom(seed + 100);
    const radius = EDGE_LENGTH * (1.2 + radiusVariation * 0.8);
    
    return {
      id: person.id,
      name: person.person_name,
      x: anchorPosition.x + Math.cos(angle) * radius,
      y: anchorPosition.y + Math.sin(angle) * radius,
      color: getAvatarColor(person.person_name),
      vx: 0,
      vy: 0,
      isRoot: false,
    };
  });

  const nodes = [rootNode, ...personNodes];

  // Run force-directed layout simulation
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    // Apply repulsion force between all nodes (including node-to-node repulsion)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Calculate node widths for overlap prevention
        const nodeIWidth = nodes[i].isRoot ? ROOT_NODE_SIZE : calculateNodeWidth(nodes[i].name);
        const nodeJWidth = nodes[j].isRoot ? ROOT_NODE_SIZE : calculateNodeWidth(nodes[j].name);
        const minDistance = (nodeIWidth + nodeJWidth) / 2 + 20; // 20px padding
        
        // Stronger repulsion if nodes are too close
        let force = REPULSION_STRENGTH / (distance * distance);
        if (distance < minDistance) {
          force *= 2; // Double the force if overlapping
        }
        
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        
        // Don't move the root node
        if (!nodes[i].isRoot) {
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
        }
        
        if (!nodes[j].isRoot) {
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }
    }

    // Apply attraction force from each person node to root node ONLY
    personNodes.forEach(node => {
      const dx = rootNode.x - node.x;
      const dy = rootNode.y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      
      const force = (distance - EDGE_LENGTH) * ATTRACTION_STRENGTH;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      
      node.vx += fx;
      node.vy += fy;
    });

    // Update positions and apply damping (skip root node)
    personNodes.forEach((node) => {
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= DAMPING;
      node.vy *= DAMPING;

      // Keep nodes within screen bounds with padding
      const nodeWidth = calculateNodeWidth(node.name);
      const padding = 40;
      node.x = Math.max(nodeWidth / 2 + padding, Math.min(SCREEN_WIDTH - nodeWidth / 2 - padding, node.x));
      node.y = Math.max(NODE_HEIGHT / 2 + padding + 60, Math.min(SCREEN_HEIGHT - NODE_HEIGHT / 2 - padding - 120, node.y));
    });
  }

  return nodes;
};

export function PeopleGraph({ people, onClose, anchorPosition }: PeopleGraphProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const nodesRef = useRef<GraphNode[]>([]);

  useEffect(() => {
    console.log('[PeopleGraph] Rendering graph with people:', people);
    console.log('[PeopleGraph] Anchor position:', anchorPosition);
    console.log('[PeopleGraph] Platform:', Platform.OS);
    
    // Calculate layout
    nodesRef.current = calculateLayout(people, anchorPosition);
    console.log('[PeopleGraph] Calculated nodes:', nodesRef.current);

    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [people, anchorPosition]);

  const handleClose = () => {
    console.log('[PeopleGraph] Closing graph');
    // Animate out
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleRootNodePress = () => {
    console.log('[PeopleGraph] Root node pressed - collapsing graph');
    handleClose();
  };

  const nodes = nodesRef.current;
  const rootNode = nodes.find(n => n.isRoot);
  const personNodes = nodes.filter(n => !n.isRoot);

  // Create edges for rendering - ONLY connect person nodes to root node
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  
  if (rootNode) {
    personNodes.forEach(node => {
      edges.push({
        x1: rootNode.x,
        y1: rootNode.y,
        x2: node.x,
        y2: node.y,
      });
    });
  }

  console.log('[PeopleGraph] Rendering', nodes.length, 'nodes and', edges.length, 'edges');

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        }
      ]}
      pointerEvents="box-none"
    >
      {/* Backdrop - clickable to close */}
      <Pressable 
        style={styles.backdrop} 
        onPress={handleClose}
      />

      {/* Close button */}
      <Pressable style={styles.closeButton} onPress={handleClose}>
        <View style={styles.closeButtonInner}>
          <IconSymbol 
            ios_icon_name="xmark.circle.fill"
            android_material_icon_name="cancel"
            size={36} 
            color="#FFFFFF" 
          />
        </View>
      </Pressable>

      {/* Graph visualization */}
      <Animated.View 
        style={[
          styles.graphContainer,
          {
            transform: [{ scale: scaleAnim }],
          }
        ]}
        pointerEvents="box-none"
      >
        {/* Render edges */}
        <View style={styles.edgesContainer} pointerEvents="none">
          {edges.map((edge, index) => {
            const length = Math.sqrt(
              Math.pow(edge.x2 - edge.x1, 2) + Math.pow(edge.y2 - edge.y1, 2)
            );
            const angle = Math.atan2(edge.y2 - edge.y1, edge.x2 - edge.x1) * (180 / Math.PI);

            return (
              <View
                key={`edge-${index}`}
                style={[
                  styles.edge,
                  {
                    width: length,
                    left: edge.x1,
                    top: edge.y1,
                    transform: [{ rotate: `${angle}deg` }],
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Render root node (people icon) - Now clickable to collapse */}
        {rootNode && (
          <Pressable
            onPress={handleRootNodePress}
            style={[
              styles.rootNode,
              {
                left: rootNode.x - ROOT_NODE_SIZE / 2,
                top: rootNode.y - ROOT_NODE_SIZE / 2,
                width: ROOT_NODE_SIZE,
                height: ROOT_NODE_SIZE,
                backgroundColor: colors.primary,
              },
            ]}
          >
            <IconSymbol 
              ios_icon_name="person.3.fill"
              android_material_icon_name="group"
              size={28} 
              color="#FFFFFF" 
            />
          </Pressable>
        )}

        {/* Render person nodes */}
        {personNodes.map((node) => {
          const nodeWidth = calculateNodeWidth(node.name);
          
          return (
            <View
              key={node.id}
              style={[
                styles.personNode,
                {
                  left: node.x - nodeWidth / 2,
                  top: node.y - NODE_HEIGHT / 2,
                  width: nodeWidth,
                  height: NODE_HEIGHT,
                  backgroundColor: node.color,
                },
              ]}
            >
              <Text 
                style={styles.nodeName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {node.name}
              </Text>
            </View>
          );
        })}
      </Animated.View>
    </Animated.View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 48,
    right: 16,
    zIndex: 1000000,
    elevation: 1000000,
    padding: 8,
  },
  closeButtonInner: {
    backgroundColor: 'rgba(255, 107, 122, 0.95)',
    borderRadius: 20,
    padding: 4,
    shadowColor: '#FF6B7A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 12,
  },
  graphContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  edgesContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  edge: {
    position: 'absolute',
    height: 3,
    backgroundColor: colors.primary,
    opacity: 0.7,
    transformOrigin: 'left center',
  },
  rootNode: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#FF6B7A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  personNode: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: NODE_PADDING,
    borderWidth: 2,
    borderColor: '#776C6E',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  nodeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4E4749',
    textAlign: 'center',
  },
});
