
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
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
  width: number;
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
const MIN_RADIUS = 120; // Minimum distance from root
const MAX_RADIUS = 220; // Maximum distance from root
const REPULSION_STRENGTH = 10000; // Increased for better separation
const ATTRACTION_STRENGTH = 0.05; // Attraction to maintain connection to root
const DAMPING = 0.65; // Damping for smooth movement
const ITERATIONS = 250; // Iterations for force simulation
const MIN_NODE_SPACING = 60; // Minimum space between nodes

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

// Force-directed layout algorithm with centered root and randomized distances
const calculateLayout = (
  people: Person[]
): GraphNode[] => {
  // Center the root node on the screen
  const centerX = SCREEN_WIDTH / 2;
  const centerY = SCREEN_HEIGHT / 2;

  // Create root node at center
  const rootNode: GraphNode = {
    id: 'root',
    name: 'People',
    x: centerX,
    y: centerY,
    color: colors.primary,
    vx: 0,
    vy: 0,
    isRoot: true,
    width: ROOT_NODE_SIZE,
  };

  // Initialize person nodes with randomized positions around the root
  const personNodes: GraphNode[] = people.map((person, index) => {
    // Base angle with even distribution
    const baseAngle = (index / people.length) * 2 * Math.PI;
    
    // Generate seed from person ID for consistent randomization
    const seed = person.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Add randomization to angle (±30 degrees)
    const angleVariation = (seededRandom(seed) - 0.5) * (Math.PI / 3);
    const angle = baseAngle + angleVariation;
    
    // Randomize radius between MIN_RADIUS and MAX_RADIUS
    const radiusVariation = seededRandom(seed + 100);
    const radius = MIN_RADIUS + radiusVariation * (MAX_RADIUS - MIN_RADIUS);
    
    const width = calculateNodeWidth(person.person_name);
    
    return {
      id: person.id,
      name: person.person_name,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      color: getAvatarColor(person.person_name),
      vx: 0,
      vy: 0,
      isRoot: false,
      width,
    };
  });

  const nodes = [rootNode, ...personNodes];

  // Run force-directed layout simulation
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    // Apply repulsion force between all nodes to prevent overlap
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Calculate minimum distance based on node widths
        const minDistance = (nodes[i].width + nodes[j].width) / 2 + MIN_NODE_SPACING;
        
        // Stronger repulsion if nodes are too close
        let force = REPULSION_STRENGTH / (distance * distance);
        if (distance < minDistance) {
          force *= 3; // Triple the force if overlapping
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
      
      // Calculate target distance (randomized for each node)
      const seed = node.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const radiusVariation = seededRandom(seed + 100);
      const targetDistance = MIN_RADIUS + radiusVariation * (MAX_RADIUS - MIN_RADIUS);
      
      const force = (distance - targetDistance) * ATTRACTION_STRENGTH;
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
      const padding = 40;
      node.x = Math.max(node.width / 2 + padding, Math.min(SCREEN_WIDTH - node.width / 2 - padding, node.x));
      node.y = Math.max(NODE_HEIGHT / 2 + padding + 60, Math.min(SCREEN_HEIGHT - NODE_HEIGHT / 2 - padding - 120, node.y));
    });
  }

  return nodes;
};

export function PeopleGraph({ people, onClose }: PeopleGraphProps) {
  const nodesRef = useRef<GraphNode[]>([]);
  const [opacity, setOpacity] = React.useState(0);
  const [scale, setScale] = React.useState(0.8);

  useEffect(() => {
    console.log('[PeopleGraph Web] Rendering graph with people:', people);
    
    // Calculate layout with centered root
    nodesRef.current = calculateLayout(people);
    console.log('[PeopleGraph Web] Calculated nodes:', nodesRef.current);

    // Animate in
    setTimeout(() => {
      setOpacity(1);
      setScale(1);
    }, 50);
  }, [people]);

  const handleClose = () => {
    console.log('[PeopleGraph Web] Closing graph');
    // Animate out
    setOpacity(0);
    setScale(0.8);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleRootNodePress = () => {
    console.log('[PeopleGraph Web] Root node pressed - collapsing graph');
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

  console.log('[PeopleGraph Web] Rendering', nodes.length, 'nodes and', edges.length, 'edges');

  return (
    <View 
      style={[
        styles.container,
        {
          opacity,
          transition: 'opacity 0.3s ease-in-out',
        }
      ]}
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
      <View 
        style={[
          styles.graphContainer,
          {
            transform: `scale(${scale})`,
            transition: 'transform 0.3s ease-in-out',
          }
        ]}
      >
        {/* Render edges */}
        <View style={styles.edgesContainer}>
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
                    transform: `rotate(${angle}deg)`,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Render root node (people icon) - Centered and clickable to collapse */}
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
          return (
            <View
              key={node.id}
              style={[
                styles.personNode,
                {
                  left: node.x - node.width / 2,
                  top: node.y - NODE_HEIGHT / 2,
                  width: node.width,
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 1000000,
    padding: 8,
  },
  closeButtonInner: {
    backgroundColor: 'rgba(255, 107, 122, 0.95)',
    borderRadius: 20,
    padding: 4,
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.6)',
    cursor: 'pointer',
  },
  graphContainer: {
    flex: 1,
    position: 'relative',
  },
  edgesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
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
    boxShadow: '0px 6px 20px rgba(255, 107, 122, 0.6)',
    cursor: 'pointer',
  },
  personNode: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: NODE_PADDING,
    borderWidth: 2,
    borderColor: '#776C6E',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.5)',
  },
  nodeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4E4749',
    textAlign: 'center',
  },
});
