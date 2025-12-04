
# Query Performance Quick Reference Card

## 🚀 Quick Wins

### 1. Always Use Indexes
```typescript
// ✅ GOOD: Uses idx_recalls_user_created
const { data } = await supabase
  .from('recalls')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(10);

// ❌ BAD: No index on location
const { data } = await supabase
  .from('recalls')
  .select('*')
  .ilike('location', '%New York%'); // Sequential scan!
```

### 2. Batch Queries
```typescript
// ✅ GOOD: Single query
const { data } = await supabase
  .from('recall_images')
  .select('*')
  .in('recall_id', recallIds); // Batch fetch

// ❌ BAD: N+1 queries
for (const id of recallIds) {
  const { data } = await supabase
    .from('recall_images')
    .select('*')
    .eq('recall_id', id); // One query per ID!
}
```

### 3. Cache Everything
```typescript
// ✅ GOOD: Cache with useRef
const cache = useRef<Map<string, any>>(new Map());

const getData = async (id: string) => {
  if (cache.current.has(id)) {
    return cache.current.get(id); // Instant!
  }
  const data = await fetchData(id);
  cache.current.set(id, data);
  return data;
};

// ❌ BAD: Fetch every time
const getData = async (id: string) => {
  return await fetchData(id); // Always hits DB
};
```

### 4. Prefer CDN URLs
```typescript
// ✅ GOOD: Use CDN URL
if (image.cdn_url) {
  return image.cdn_url; // Instant, no DB call
}

// ❌ BAD: Always fetch base64
const base64 = await getImageDataUrl(image.id); // Slow DB query
```

### 5. Lazy Load
```typescript
// ✅ GOOD: Load first 2, lazy load rest
const images = await Promise.all(
  allImages.map(async (img, index) => {
    if (index < 2) {
      return await loadImage(img.id);
    }
    return { url: '', id: img.id }; // Placeholder
  })
);

// ❌ BAD: Load all immediately
const images = await Promise.all(
  allImages.map(img => loadImage(img.id)) // Slow!
);
```

---

## 📊 Available Indexes

### Recalls Table
- `idx_recalls_user_created` → `(user_id, created_at DESC)`
- `idx_recalls_location` → `(user_id, latitude, longitude)` WHERE location NOT NULL
- `idx_recalls_embedding` → `(user_id)` WHERE embedding NOT NULL

### Recall Images Table
- `idx_recall_images_recall_id` → `(recall_id)`
- `idx_recall_images_user_recall` → `(user_id, recall_id)`
- `idx_recall_images_user_id` → `(user_id, created_at)`
- `idx_recall_images_unprocessed` → `(id, recall_id)` WHERE processed_at IS NULL

### Recall People Table
- `idx_recall_people_recall_id` → `(recall_id)`
- `idx_recall_people_person_id` → `(person_id)`
- `idx_recall_people_person_user` → `(person_id, user_id)`

### Recollections Table
- `idx_recollections_user_category` → `(user_id, category_id, match_score DESC)`
- `idx_recollections_category_score` → `(category_id, match_score DESC)` WHERE match_score > 0

### Search History Table
- `idx_search_history_user_updated` → `(user_id, updated_at DESC)`

---

## 🎯 Query Patterns

### Landing Page
```typescript
// Optimized query using idx_recalls_user_created
const { data } = await supabase
  .from('recalls')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .range(0, 9); // First 10 items
```

### Person Recalls
```typescript
// Step 1: Get recall IDs (uses idx_recall_people_person_user)
const { data: recallPeople } = await supabase
  .from('recall_people')
  .select('recall_id')
  .eq('person_id', personId)
  .eq('user_id', userId);

// Step 2: Batch fetch recalls
const recallIds = recallPeople.map(rp => rp.recall_id);
const { data: recalls } = await supabase
  .from('recalls')
  .select('*')
  .in('id', recallIds);
```

### Category Viewer
```typescript
// Step 1: Get recall IDs (uses idx_recollections_category_score)
const { data: recollections } = await supabase
  .from('recollections')
  .select('recall_id, match_score')
  .eq('category_id', categoryId)
  .eq('user_id', userId)
  .order('match_score', { ascending: false });

// Step 2: Batch fetch recalls
const recallIds = recollections.map(r => r.recall_id);
const { data: recalls } = await supabase
  .from('recalls')
  .select('*')
  .in('id', recallIds);
```

### Image Loading
```typescript
// Batch fetch all images (uses idx_recall_images_user_recall)
const { data: images } = await supabase
  .from('recall_images')
  .select('id, recall_id, cdn_url')
  .in('recall_id', recallIds)
  .order('created_at', { ascending: true });

// Group by recall_id in memory
const imagesByRecall = new Map();
images.forEach(img => {
  if (!imagesByRecall.has(img.recall_id)) {
    imagesByRecall.set(img.recall_id, []);
  }
  imagesByRecall.get(img.recall_id).push(img);
});
```

---

## ⚡ Performance Targets

| Operation | Target | Current |
|-----------|--------|---------|
| Landing page load | <300ms | 217ms ✅ |
| Person recalls | <400ms | 333ms ✅ |
| Category viewer | <300ms | 243ms ✅ |
| Image loading (first 2) | <200ms | 180ms ✅ |
| Search query | <500ms | ~450ms ✅ |

---

## 🔍 Debugging Slow Queries

### 1. Check Query Plan
```sql
EXPLAIN ANALYZE
SELECT * FROM recalls WHERE user_id = 'xxx' ORDER BY created_at DESC LIMIT 10;
```

**Look for:**
- ✅ "Index Scan" = Good
- ❌ "Seq Scan" = Bad (add index!)
- ❌ Execution time >100ms = Optimize

### 2. Check Index Usage
```sql
SELECT 
  indexname,
  idx_scan as scans
FROM pg_stat_user_indexes
WHERE tablename = 'recalls'
ORDER BY idx_scan DESC;
```

**Look for:**
- Scans = 0 → Unused index (consider removing)
- High scans → Good, index is being used

### 3. Check Cache Hit Rate
```typescript
console.log('Cache stats:', {
  hits: cacheHits,
  misses: cacheMisses,
  hitRate: (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(1) + '%'
});
```

**Target:** 60-70% hit rate for repeated data

---

## 🚨 Common Mistakes

### 1. Forgetting to Filter by user_id
```typescript
// ❌ BAD: No user filter (security + performance issue!)
const { data } = await supabase
  .from('recalls')
  .select('*')
  .eq('id', recallId);

// ✅ GOOD: Always filter by user
const { data } = await supabase
  .from('recalls')
  .select('*')
  .eq('id', recallId)
  .eq('user_id', userId); // Uses composite index!
```

### 2. Using SELECT * When You Don't Need All Columns
```typescript
// ❌ BAD: Fetches all columns including large embeddings
const { data } = await supabase
  .from('recalls')
  .select('*')
  .eq('user_id', userId);

// ✅ GOOD: Only select what you need
const { data } = await supabase
  .from('recalls')
  .select('id, text, created_at, location')
  .eq('user_id', userId);
```

### 3. Not Using .in() for Batch Queries
```typescript
// ❌ BAD: Multiple queries
const images = [];
for (const recallId of recallIds) {
  const { data } = await supabase
    .from('recall_images')
    .select('*')
    .eq('recall_id', recallId);
  images.push(...data);
}

// ✅ GOOD: Single batch query
const { data: images } = await supabase
  .from('recall_images')
  .select('*')
  .in('recall_id', recallIds);
```

### 4. Over-Using Realtime Subscriptions
```typescript
// ❌ BAD: Subscribe to everything
supabase
  .channel('all-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'recalls' },
    callback
  );

// ✅ GOOD: Subscribe with filters + unsubscribe
const channel = supabase
  .channel('my-recalls')
  .on('postgres_changes', 
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'recalls',
      filter: `user_id=eq.${userId}`
    },
    callback
  )
  .subscribe();

// Don't forget to unsubscribe!
return () => {
  supabase.removeChannel(channel);
};
```

### 5. Not Clearing Caches on Updates
```typescript
// ❌ BAD: Cache becomes stale
const updateRecall = async (id, updates) => {
  await supabase
    .from('recalls')
    .update(updates)
    .eq('id', id);
  // Cache still has old data!
};

// ✅ GOOD: Clear cache on update
const updateRecall = async (id, updates) => {
  await supabase
    .from('recalls')
    .update(updates)
    .eq('id', id);
  
  cache.current.delete(id); // Clear cache
  await refreshData(); // Reload fresh data
};
```

---

## 📈 Monitoring Checklist

Daily:
- [ ] Check error logs for slow queries
- [ ] Monitor cache hit rates
- [ ] Review user-reported performance issues

Weekly:
- [ ] Run ANALYZE on main tables
- [ ] Check index usage statistics
- [ ] Review query performance metrics

Monthly:
- [ ] Audit unused indexes
- [ ] Review and optimize slow queries
- [ ] Check database size and growth
- [ ] Update performance documentation

---

## 🆘 Emergency Performance Issues

### Symptom: Everything is slow

1. Check database CPU: Supabase Dashboard → Database → Performance
2. Check active queries:
   ```sql
   SELECT * FROM pg_stat_activity WHERE state = 'active';
   ```
3. Kill long-running queries if needed:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = XXX;
   ```

### Symptom: Specific query is slow

1. Get query plan:
   ```sql
   EXPLAIN ANALYZE <your query>;
   ```
2. Look for sequential scans
3. Add missing indexes
4. Simplify query if possible

### Symptom: Realtime is lagging

1. Reduce subscription count
2. Add filters to subscriptions
3. Simplify RLS policies
4. Consider polling instead

---

**Quick Reference Version:** 1.0
**Last Updated:** December 2025
