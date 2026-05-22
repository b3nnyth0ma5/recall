import React, { useState, useEffect, useRef, memo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { SkeletonLoader } from './SkeletonLoader';
import { fetchOgImageUrl } from '@/utils/ogImageScraper';

export interface UrlPreviewCardProps {
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogSiteName: string | null;
}

function UrlPreviewCard({ url, ogTitle, ogDescription, ogSiteName }: UrlPreviewCardProps) {
  // undefined = still loading, null = failed/none, string = loaded
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    fetchOgImageUrl(url).then(result => {
      if (mountedRef.current) {
        setImageUrl(result);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, [url]);

  const fallbackSite = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();
  const displaySite = ogSiteName ?? fallbackSite;

  const isLoading = ogTitle === null && ogDescription === null && ogSiteName === null;
  const hasImage = typeof imageUrl === 'string';
  const imageLoading = imageUrl === undefined;

  const handlePress = () => {
    console.log('[UrlPreviewCard] User tapped URL preview card:', url);
    Linking.openURL(url).catch(err => {
      console.warn('[UrlPreviewCard] Failed to open URL:', url, err);
    });
  };

  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <SkeletonLoader width={88} height={88} borderRadius={8} />
          <View style={styles.textColumn}>
            <SkeletonLoader width="90%" height={14} borderRadius={4} />
            <SkeletonLoader width="75%" height={12} borderRadius={4} style={styles.skeletonGap} />
            <SkeletonLoader width="50%" height={12} borderRadius={4} style={styles.skeletonBottom} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      <View style={styles.row}>
        {(hasImage || imageLoading) && (
          <View style={[styles.imageContainer, imageLoading && styles.imagePlaceholder]}>
            {hasImage && (
              <Image
                source={{ uri: imageUrl as string }}
                style={styles.image}
                resizeMode="cover"
                onError={() => setImageUrl(null)}
              />
            )}
          </View>
        )}

        <View style={[styles.textColumn, !hasImage && !imageLoading && styles.textColumnFull]}>
          {ogTitle ? (
            <Text style={styles.title} numberOfLines={2}>
              {ogTitle}
            </Text>
          ) : null}

          {ogDescription ? (
            <Text style={styles.description} numberOfLines={2}>
              {ogDescription}
            </Text>
          ) : null}

          <View style={styles.domainRow}>
            <IconSymbol name="link" size={11} color={colors.textTertiary} />
            <Text style={styles.domainText} numberOfLines={1}>
              {displaySite}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default memo(UrlPreviewCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    marginHorizontal: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  imageContainer: {
    width: 88,
    height: 88,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.background,
    flexShrink: 0,
  },
  imagePlaceholder: {
    backgroundColor: colors.background,
  },
  image: {
    width: 88,
    height: 88,
    borderRadius: 8,
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  textColumnFull: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    opacity: 0.85,
  },
  domainText: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  skeletonGap: {
    marginTop: 8,
  },
  skeletonBottom: {
    marginTop: 12,
  },
});
