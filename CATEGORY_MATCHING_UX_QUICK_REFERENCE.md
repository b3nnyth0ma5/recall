
# Category Matching UX - Quick Reference

## Key States

### 1. Initial Load (loading = true)
```typescript
// Shows skeleton with category info and note cards
renderSkeletons()
```

### 2. Matching In Progress (isMatching = true)
```typescript
// Shows real category info + matching status + placeholders
renderMatchingPlaceholders()
```

### 3. Normal View (isMatching = false)
```typescript
// Shows real category info + recalls or empty state
<ScrollView>...</ScrollView>
```

## Visual Indicators

### Matching Status
```typescript
<View style={styles.matchingStatusContainer}>
  <ActivityIndicator size="small" color={colors.primary} />
  <Text style={styles.matchingStatusText}>Finding matches...</Text>
</View>
```

### Info Message
```typescript
<View style={styles.matchingInfoContainer}>
  <IconSymbol name="sparkles" size={20} color={colors.primary} />
  <Text style={styles.matchingInfoText}>
    Analyzing your recalls to find matches...
  </Text>
</View>
```

## Zero State Variants

### During Matching
- Icon: ActivityIndicator (animated)
- Title: "Finding Matching Recalls"
- Message: AI is analyzing...
- Info: What's happening explanation

### After Matching (No Results)
- Icon: Tray (static)
- Title: "No Matching Recalls"
- Message: Create recalls to see matches
- Info: Auto-matching explanation

## Polling Logic

### Start Polling
```typescript
startMatchingPolling() // Called when is_matching = true
```

### Stop Polling
```typescript
// Automatically stops when:
// 1. is_matching becomes false
// 2. Component unmounts
// 3. User navigates away
```

### Polling Interval
- **Frequency**: Every 3 seconds
- **Query**: Only fetches `is_matching` field
- **Action**: Reloads recalls when complete

## Edge Function Integration

### Create Category
```typescript
// 1. Insert category with is_matching = true
// 2. Navigate to category viewer
// 3. Trigger edge function (fire and forget)
// 4. Edge function sets is_matching = false when done
```

### Edit Category
```typescript
// 1. Update category with is_matching = true
// 2. Start polling
// 3. Trigger edge function
// 4. Edge function sets is_matching = false when done
```

## Component Lifecycle

```
Mount
  ↓
Load Category (check is_matching)
  ↓
is_matching = true? → Start Polling
  ↓
Poll every 3s
  ↓
is_matching = false? → Stop Polling + Reload
  ↓
Unmount → Cleanup Interval
```

## Key Props & State

```typescript
interface Category {
  id: string;
  category_name: string;
  category_search_description: string;
  icon_cdn_url: string | null;
  user_id: string;
  is_matching: boolean; // ← Key field
}

const [isMatching, setIsMatching] = useState(false);
const matchingCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
```

## Common Patterns

### Check Matching Status
```typescript
const { data } = await supabase
  .from('recollection_categories')
  .select('is_matching')
  .eq('id', categoryId)
  .single();

setIsMatching(data.is_matching || false);
```

### Trigger Matching
```typescript
// 1. Set is_matching = true
await supabase
  .from('recollection_categories')
  .update({ is_matching: true })
  .eq('id', categoryId);

// 2. Start polling
startMatchingPolling();

// 3. Invoke edge function
supabase.functions.invoke('new-category-matching', {
  body: { categoryId }
});
```

### Cleanup
```typescript
useEffect(() => {
  return () => {
    if (matchingCheckIntervalRef.current) {
      clearInterval(matchingCheckIntervalRef.current);
      matchingCheckIntervalRef.current = null;
    }
  };
}, []);
```

## Styling

### Matching Status Container
```typescript
matchingStatusContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginTop: 8,
}
```

### Matching Info Container
```typescript
matchingInfoContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  paddingVertical: 16,
  paddingHorizontal: 24,
  marginHorizontal: 16,
  marginTop: 16,
  backgroundColor: `${colors.primary}15`,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: `${colors.primary}30`,
}
```

## Debugging

### Console Logs
```typescript
console.log('[CategoryViewer] Category loaded:', categoryData.category_name, 'is_matching:', categoryData.is_matching);
console.log('[CategoryViewer] Starting matching polling...');
console.log('[CategoryViewer] Checking if matching is complete...');
console.log('[CategoryViewer] Matching complete! Reloading recalls...');
```

### Check Database
```sql
SELECT id, category_name, is_matching 
FROM recollection_categories 
WHERE user_id = 'user-id';
```

## Performance Tips

1. **Polling Frequency**: 3 seconds is optimal (responsive but not excessive)
2. **Query Optimization**: Only fetch `is_matching` field during polling
3. **Cleanup**: Always clear intervals on unmount
4. **Skeleton Reuse**: Use existing NoteCard loading state
5. **Conditional Rendering**: Only show placeholders when needed

## Error Handling

### Polling Error
```typescript
try {
  const { data, error } = await supabase...
  if (error) {
    console.error('[CategoryViewer] Error checking matching status:', error);
    return; // Continue polling
  }
} catch (error) {
  console.error('[CategoryViewer] Error in matching polling:', error);
}
```

### Edge Function Error
```typescript
// Edge function sets is_matching = false even on error
// Polling will detect this and stop automatically
```
