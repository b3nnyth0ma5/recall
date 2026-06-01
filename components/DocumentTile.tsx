import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { Document } from '@/types/Document';
import { IconSymbol } from './IconSymbol';
import { formatFileSize, getFileExtension, getDocumentColor } from '@/utils/documentPicker';

interface DocumentTileProps {
  document: Document;
  width: number;
  height: number;
  onPress?: () => void;
  onRemove?: () => void;
  showRemoveButton?: boolean;
}

export function DocumentTile({
  document,
  width,
  height,
  onPress,
  onRemove,
  showRemoveButton = false,
}: DocumentTileProps) {
  const thumbnailUrl = document.local_thumbnail_uri ?? document.thumbnail_url;
  const extension = getFileExtension(document.file_name);
  const docColor = getDocumentColor(document.content_type);
  const isUploading = document.upload_state === 'uploading' || document.upload_state === 'pending';
  const isFailed = document.upload_state === 'failed';
  const isProcessing = document.cdn_url && !document.processed_at;
  const fileSizeText = document.file_size ? formatFileSize(document.file_size) : '';
  const truncatedName = document.file_name.length > 22
    ? document.file_name.substring(0, 19) + '...'
    : document.file_name;

  return (
    <Pressable
      style={[styles.container, { width, height }]}
      onPress={() => {
        console.log('[DocumentTile] User tapped document tile:', document.file_name);
        onPress?.();
      }}
    >
      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={[styles.thumbnail, { width, height }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.placeholder, { width, height, backgroundColor: docColor }]}>
          <Text style={styles.extensionText}>{extension}</Text>
        </View>
      )}

      {/* Bottom gradient overlay with file name */}
      <View style={styles.overlay}>
        <IconSymbol name="doc.fill" size={14} color="#FFFFFF" />
        <Text style={styles.fileName} numberOfLines={1}>
          {truncatedName}
        </Text>
        {fileSizeText ? (
          <Text style={styles.fileSize}>{fileSizeText}</Text>
        ) : null}
      </View>

      {/* Uploading overlay */}
      {isUploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}

      {/* Failed overlay with retry icon */}
      {isFailed && (
        <View style={styles.failedOverlay}>
          <IconSymbol name="arrow.clockwise" size={20} color="#FFFFFF" />
          <Text style={styles.failedText}>Failed</Text>
        </View>
      )}

      {/* Processing badge (server-side text extraction in progress) */}
      {isProcessing && !isUploading && (
        <View style={styles.processingBadge}>
          <ActivityIndicator size="small" color="#FFFFFF" style={styles.processingSpinner} />
        </View>
      )}

      {/* Remove button */}
      {showRemoveButton && (
        <Pressable
          style={styles.removeButton}
          onPress={() => {
            console.log('[DocumentTile] User tapped remove button for:', document.file_name);
            onRemove?.();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.removeButtonCircle}>
            <IconSymbol name="xmark" size={12} color="#FFFFFF" />
          </View>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#333333',
    position: 'relative',
  },
  thumbnail: {
    borderRadius: 12,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  extensionText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fileName: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    flex: 1,
  },
  fileSize: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
  },
  uploadingText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  failedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(200,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
  },
  failedText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  processingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingSpinner: {
    // no extra styles needed
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  removeButtonCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
