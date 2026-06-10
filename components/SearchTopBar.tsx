
import React, { forwardRef } from 'react';
import { View, TextInput, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

// ── Interactive mode (search screen) ──────────────────────────────────────────
interface InteractiveProps {
  mode: 'interactive';
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  onClear?: () => void;
  onFocus?: () => void;
  withSafeArea?: boolean;
}

// ── Launcher mode (landing page) ──────────────────────────────────────────────
interface LauncherProps {
  mode: 'launcher';
  onPress: () => void;
  withSafeArea?: boolean;
}

type SearchTopBarProps = InteractiveProps | LauncherProps;

const PLACEHOLDER = 'Search with Recall AI';

export const SearchTopBar = forwardRef<TextInput, SearchTopBarProps>(
  (props, ref) => {
    const insets = useSafeAreaInsets();
    const withSafeArea = props.withSafeArea !== false;
    const topPadding = withSafeArea ? insets.top + 8 : 8;

    if (props.mode === 'launcher') {
      return (
        <Pressable
          onPress={() => {
            console.log('[SearchTopBar] Launcher search bar pressed');
            props.onPress();
          }}
          style={[styles.container, { paddingTop: topPadding }]}
        >
          <View style={styles.searchBar}>
            <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
            <Text style={styles.placeholderText} numberOfLines={1}>
              {PLACEHOLDER}
            </Text>
          </View>
        </Pressable>
      );
    }

    // interactive mode
    const hasValue = props.value.length > 0;

    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <View style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
          <TextInput
            ref={ref}
            style={styles.searchInput}
            placeholder={PLACEHOLDER}
            placeholderTextColor={colors.textTertiary}
            value={props.value}
            onChangeText={(text) => {
              console.log('[SearchTopBar] Text changed, length:', text.length);
              props.onChangeText(text);
            }}
            onSubmitEditing={() => {
              console.log('[SearchTopBar] Submit editing triggered');
              props.onSubmitEditing?.();
            }}
            onFocus={() => {
              console.log('[SearchTopBar] Input focused');
              props.onFocus?.();
            }}
            returnKeyType="search"
            blurOnSubmit={false}
            multiline={false}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="default"
          />
          {hasValue && (
            <Pressable
              onPress={() => {
                console.log('[SearchTopBar] Clear button pressed');
                props.onClear?.();
              }}
              style={styles.clearButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    );
  }
);

SearchTopBar.displayName = 'SearchTopBar';

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16 * 1.15,
    paddingVertical: 12,
    gap: 12,
    minHeight: 48 * 1.1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    minHeight: 24,
    paddingVertical: 0,
  },
  placeholderText: {
    flex: 1,
    fontSize: 16,
    color: colors.textTertiary,
  },
  clearButton: {
    padding: 4 * 1.15,
  },
});
