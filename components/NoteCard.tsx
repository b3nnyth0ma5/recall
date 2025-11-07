
import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Note } from '@/types/Note';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
}

export function NoteCard({ note, onPress }: NoteCardProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const getPreviewText = () => {
    if (!note.content) return 'No content';
    return note.content.length > 100 
      ? note.content.substring(0, 100) + '...' 
      : note.content;
  };

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed
      ]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1}>
          {note.title || 'Untitled Note'}
        </Text>
        <Text style={styles.date}>{formatDate(note.updatedAt)}</Text>
      </View>
      
      {note.content && (
        <Text style={styles.preview} numberOfLines={3}>
          {getPreviewText()}
        </Text>
      )}

      {note.images && note.images.length > 0 && (
        <View style={styles.imagesContainer}>
          <View style={styles.imagePreviewContainer}>
            <Image 
              source={{ uri: note.images[0] }} 
              style={styles.imagePreview}
              resizeMode="cover"
            />
            {note.images.length > 1 && (
              <View style={styles.imageCountBadge}>
                <IconSymbol name="photo" size={12} color={colors.card} />
                <Text style={styles.imageCountText}>+{note.images.length - 1}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.footer}>
        {note.images && note.images.length > 0 && (
          <View style={styles.iconBadge}>
            <IconSymbol name="photo" size={14} color={colors.textSecondary} />
            <Text style={styles.badgeText}>{note.images.length}</Text>
          </View>
        )}
        {!note.synced && (
          <View style={styles.syncBadge}>
            <IconSymbol name="arrow.clockwise" size={14} color={colors.accent} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: colors.highlight,
    transform: [{ scale: 0.98 }],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  date: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  preview: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  imagesContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  imageCountText: {
    color: colors.card,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  syncBadge: {
    marginLeft: 'auto',
  },
});
