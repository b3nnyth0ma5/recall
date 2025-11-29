
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Animated } from 'react-native';
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
}

interface GraphEdge {
  source: string;
  target: string;
}

interface PeopleGraphProps {
  people: Person[];
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const NODE_HEIGHT = 36;
const NODE_MIN_WIDTH = 120;
const NODE_PADDING = 16;
const EDGE_LENGTH = 100;
const REPULSION_STRENGTH = 3000;
const ATTRACTION_STRENGTH = 0.05;
const DAMPING = 0.8;
const ITERATIONS = 100;

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
  const charWidth = 8; // Approximate character width
  const calculatedWidth = name.length * charWidth + NODE_PADDING * 2;
  return Math.max(NODE_MIN_WIDTH, Math.min(calculatedWidth, SCREEN_WIDTH * 0.8));
};

// Force-directed layout algorithm
const calculateLayout = (
  people: Person[],
  anchorPosition: { x: number; y: number }
): GraphNode[] => {
  // Initialize nodes with random positions
  const nodes: GraphNode[] = people.map((person, index) => ({
    id: person.id,
    name: person.person_name,
    x: index === 0 ? anchorPosition.x : Math.random() * SCREEN_WIDTH,
    y: index === 0 ? anchorPosition.y : Math.random() * SCREEN_HEIGHT,
    color: getAvatarColor(person.person_name),
    vx: 0,
    vy: 0,
  }));

  // Create edges - connect all nodes to the root node (first person)
  const edges: GraphEdge[] = [];
  for (let i = 1; i < people.length; i++) {
    edges.push({
      source: people[0].id,
      target: people[i].id,
    });
  }

  // Also create some connections between non-root nodes for a more interesting graph
  for (let i = 1; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      // Connect some nodes randomly (30% chance)
      if (Math.random() < 0.3) {
        edges.push({
          source: people[i].id,
          target: people[j].id,
        });
      }
    }
  }

  // Run force-directed layout simulation
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    // Apply repulsion force between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const force = REPULSION_STRENGTH / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Apply attraction force along edges
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      
      if (source && target) {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const force = (distance - EDGE_LENGTH) * ATTRACTION_STRENGTH;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }
    });

    // Update positions and apply damping
    nodes.forEach((node, index) => {
      // Don't move the root node (anchored)
      if (index === 0) {
        node.vx = 0;
        node.vy = 0;
        return;
      }

      node.x += node.vx;
      node.y += node.vy;
      node.vx *= DAMPING;
      node.vy *= DAMPING;

      // Keep nodes within screen bounds with padding
      const nodeWidth = calculateNodeWidth(node.name);
      const padding = 20;
      node.x = Math.max(nodeWidth / 2 + padding, Math.min(SCREEN_WIDTH - nodeWidth / 2 - padding, node.x));
      node.y = Math.max(NODE_HEIGHT / 2 + padding, Math.min(SCREEN_HEIGHT - NODE_HEIGHT / 2 - padding - 100, node.y));
    });
  }

  return nodes;
};

export function PeopleGraph({ people, onClose, anchorPosition }: PeopleGraphProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const nodesRef = useRef<GraphNode[]>([]);

  useEffect(() => {
    // Calculate layout
    nodesRef.current = calculateLayout(people, anchorPosition);

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

  const nodes = nodesRef.current;

  // Create edges for rendering
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  
  // Connect all nodes to the root node
  for (let i = 1; i < nodes.length; i++) {
    edges.push({
      x1: nodes[0].x,
      y1: nodes[0].y,
      x2: nodes[i].x,
      y2: nodes[i].y,
    });
  }

  // Add some connections between non-root nodes
  for (let i = 1; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.random() < 0.3) {
        edges.push({
          x1: nodes[i].x,
          y1: nodes[i].y,
          x2: nodes[j].x,
          y2: nodes[j].y,
        });
      }
    }
  }

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        }
      ]}
    >
      {/* Close button */}
      <Pressable style={styles.closeButton} onPress={handleClose}>
        <IconSymbol 
          name="xmark.circle.fill"
          size={32} 
          color={colors.text} 
        />
      </Pressable>

      {/* Graph visualization */}
      <Animated.View 
        style={[
          styles.graphContainer,
          {
            transform: [{ scale: scaleAnim }],
          }
        ]}
      >
        {/* Render edges using SVG */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            pointerEvents: 'none',
          }}
        >
          {edges.map((edge, index) => (
            <line
              key={`edge-${index}`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={colors.primary}
              strokeWidth={2}
              opacity={0.3}
            />
          ))}
        </svg>

        {/* Render nodes */}
        {nodes.map((node, index) => {
          const nodeWidth = calculateNodeWidth(node.name);
          
          return (
            <View
              key={node.id}
              style={[
                styles.node,
                {
                  left: node.x - nodeWidth / 2,
                  top: node.y - NODE_HEIGHT / 2,
                  width: nodeWidth,
                  height: NODE_HEIGHT,
                  backgroundColor: node.color,
                  borderWidth: index === 0 ? 2 : 1.25,
                  borderColor: index === 0 ? colors.primary : '#776C6E',
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 9999,
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10000,
    padding: 8,
  },
  graphContainer: {
    flex: 1,
    position: 'relative',
  },
  node: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: NODE_PADDING,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
  },
  nodeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4E4749',
    textAlign: 'center',
  },
});
