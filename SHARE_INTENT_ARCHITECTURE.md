
# Share Intent Architecture

Technical architecture documentation for the share intent feature.

## System Overview

```
┌─────────────────┐
│   Other Apps    │
│  (Photos, etc)  │
└────────┬────────┘
         │ Share Action
         ▼
┌─────────────────────────────────────────┐
│         Operating System                │
│  ┌─────────────────────────────────┐   │
│  │  iOS: CFBundleDocumentTypes     │   │
│  │  Android: Intent Filters        │   │
│  └─────────────┬───────────────────┘   │
└────────────────┼───────────────────────┘
                 │ Deep Link
                 ▼
┌─────────────────────────────────────────┐
│         Recall App                      │
│  ┌─────────────────────────────────┐   │
│  │  expo-linking                   │   │
│  │  getInitialURL()                │   │
│  └─────────────┬───────────────────┘   │
│                ▼                        │
│  ┌─────────────────────────────────┐   │
│  │  shareIntentHandler.ts          │   │
│  │  getShareIntentData()           │   │
│  └─────────────┬───────────────────┘   │
│                ▼                        │
│  ┌─────────────────────────────────┐   │
│  │  app/(tabs)/(home)/index.tsx    │   │
│  │  Check for share intent         │   │
│  └─────────────┬───────────────────┘   │
│                ▼                        │
│  ┌─────────────────────────────────┐   │
│  │  app/share-intent.tsx           │   │
│  │  Route handler                  │   │
│  └─────────────┬───────────────────┘   │
│                ▼                        │
│  ┌─────────────────────────────────┐   │
│  │  CreateRecallFromShare          │   │
│  │  UI Component                   │   │
│  └─────────────┬───────────────────┘   │
│                ▼                        │
│  ┌─────────────────────────────────┐   │
│  │  Save Handler                   │   │
│  │  - Create recall                │   │
│  │  - Upload images                │   │
│  │  - Trigger OCR                  │   │
│  │  - Trigger categories           │   │
│  └─────────────┬───────────────────┘   │
│                ▼                        │
│  ┌─────────────────────────────────┐   │
│  │  Toast Notification             │   │
│  │  Success feedback               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Component Architecture

### 1. Configuration Layer (app.json)

**Purpose**: Register the app with the OS to receive share intents

**iOS Configuration**:
```json
"CFBundleDocumentTypes": [
  {
    "CFBundleTypeName": "Text",
    "LSHandlerRank": "Alternate",
    "LSItemContentTypes": ["public.plain-text", "public.text"]
  },
  {
    "CFBundleTypeName": "Images",
    "LSHandlerRank": "Alternate",
    "LSItemContentTypes": ["public.image", "public.jpeg", "public.png"]
  }
]
```

**Android Configuration**:
```json
"intentFilters": [
  {
    "action": "android.intent.action.SEND",
    "category": ["android.intent.category.DEFAULT"],
    "data": [{"mimeType": "text/plain"}]
  },
  {
    "action": "android.intent.action.SEND",
    "category": ["android.intent.category.DEFAULT"],
    "data": [{"mimeType": "image/*"}]
  }
]
```

### 2. Detection Layer (shareIntentHandler.ts)

**Purpose**: Parse and extract share intent data from the OS

**Key Functions**:
- `getShareIntentData()`: Extract text and images from intent
- `hasShareIntent()`: Check if app was opened with share intent
- `createShareIntentUrl()`: Create test URLs for development

**Data Flow**:
```typescript
OS Intent → Linking.getInitialURL() → Parse URL → Extract params → Return ShareIntentData
```

### 3. Routing Layer (app/(tabs)/(home)/index.tsx)

**Purpose**: Detect share intents on app launch and route to handler

**Implementation**:
```typescript
useEffect(() => {
  const checkShareIntent = async () => {
    const shareData = await getShareIntentData();
    if (shareData) {
      router.push({
        pathname: '/share-intent',
        params: {
          text: shareData.text || '',
          images: JSON.stringify(shareData.images) || '[]',
        },
      });
    }
  };
  checkShareIntent();
}, []);
```

### 4. Handler Layer (app/share-intent.tsx)

**Purpose**: Coordinate the share intent flow

**Responsibilities**:
- Parse route parameters
- Manage component state
- Handle save operations
- Show success feedback
- Navigate after completion

**State Management**:
```typescript
const [visible, setVisible] = useState(false);
const [sharedText, setSharedText] = useState<string>('');
const [sharedImages, setSharedImages] = useState<string[]>([]);
```

### 5. UI Layer (CreateRecallFromShare.tsx)

**Purpose**: Display and edit shared content

**Features**:
- Slide-up panel animation
- Image carousel with indicators
- Text editing
- Image removal
- Save/Cancel actions
- Loading states

**Props Interface**:
```typescript
interface CreateRecallFromShareProps {
  visible: boolean;
  sharedText?: string;
  sharedImages?: string[];
  onSave: (text: string, images: string[]) => Promise<void>;
  onClose: () => void;
}
```

### 6. Feedback Layer (CustomToast.tsx)

**Purpose**: Provide user feedback and navigation

**Toast Types**:
- Success: Recall saved
- Error: Save failed
- Info: General information

**Features**:
- Tap to navigate to new recall
- Auto-dismiss after 4 seconds
- Blur effect background
- Custom styling

## Data Flow

### Share Intent Flow

```
1. User shares from another app
   ↓
2. OS opens Recall app with intent data
   ↓
3. expo-linking captures initial URL
   ↓
4. shareIntentHandler parses URL parameters
   ↓
5. Home screen detects share intent
   ↓
6. Navigate to /share-intent route
   ↓
7. Display CreateRecallFromShare panel
   ↓
8. User edits content
   ↓
9. User taps "Save Recall"
   ↓
10. Create recall in database
    ↓
11. Upload images to Cloudflare CDN
    ↓
12. Trigger OCR processing
    ↓
13. Trigger category matching
    ↓
14. Show success toast
    ↓
15. Navigate to home screen
```

### Save Operation Flow

```typescript
handleSave() {
  // 1. Validate user is logged in
  if (!user) return;
  
  // 2. Get current location
  const location = await getCurrentLocation();
  
  // 3. Create recall in database
  const recall = await supabase
    .from('recollections')
    .insert({ text, user_id, latitude, longitude, location });
  
  // 4. Upload images
  for (const imageUri of images) {
    const imageId = await uploadImageToDatabase(imageUri, recall.id);
    await triggerOCRProcessing(imageId);
  }
  
  // 5. Trigger category matching
  await triggerCategoryMatching(recall.id);
  
  // 6. Show success toast
  Toast.show({ type: 'success', text1: 'Recall Saved' });
  
  // 7. Navigate home
  router.replace('/(tabs)/(home)');
}
```

## State Management

### Component State

**CreateRecallFromShare**:
- `text`: Editable text content
- `images`: Array of image URIs
- `isSaving`: Loading state
- `currentImageIndex`: Active image in carousel

**ShareIntentScreen**:
- `visible`: Panel visibility
- `sharedText`: Initial text from share
- `sharedImages`: Initial images from share

### Global State

**AuthContext**:
- `user`: Current authenticated user
- `session`: Authentication session

**NotesContext** (via useNotes):
- `notes`: List of all recalls
- `refreshNotes()`: Refresh recalls list

## Error Handling

### Error Types

1. **Authentication Error**
   - User not logged in
   - Action: Show alert, don't save

2. **Network Error**
   - No internet connection
   - Action: Show error toast, retry option

3. **Upload Error**
   - Image upload failed
   - Action: Log error, continue with other images

4. **Database Error**
   - Insert failed
   - Action: Show error alert, don't navigate

5. **Location Error**
   - Permission denied
   - Action: Continue without location

### Error Recovery

```typescript
try {
  await handleSave();
} catch (error) {
  console.error('Error saving recall:', error);
  Alert.alert('Error', 'Failed to save recall. Please try again.');
  // Don't navigate, allow user to retry
}
```

## Performance Considerations

### Optimizations

1. **Lazy Loading**
   - Images loaded on demand
   - OCR processing in background

2. **Async Operations**
   - Image uploads don't block UI
   - Category matching is non-blocking

3. **Caching**
   - Shared images cached locally
   - No re-download needed

4. **Debouncing**
   - Text input changes debounced
   - Prevents excessive re-renders

### Performance Metrics

- Panel open: < 300ms
- Image display: < 500ms
- Save operation: 1-8s (depending on images)
- Toast display: Immediate
- Navigation: < 200ms

## Security

### Authentication
- All operations require authenticated user
- User ID attached to all recalls
- RLS policies enforce data isolation

### Data Validation
- Text sanitized before save
- Image URIs validated
- File types checked

### Privacy
- Location capture requires permission
- Images stored securely in CDN
- No data shared with third parties

## Testing Strategy

### Unit Tests
- `shareIntentHandler.ts`: Parse functions
- `CreateRecallFromShare.tsx`: Component logic
- `CustomToast.tsx`: Toast configuration

### Integration Tests
- Share intent detection
- Save operation flow
- Navigation flow
- Toast display

### E2E Tests
- Share from Photos app
- Share from Notes app
- Share multiple images
- Edit and save
- Cancel flow

## Future Enhancements

### Planned Features
1. Video support
2. PDF support
3. URL metadata extraction
4. Batch image processing
5. Share extension (iOS)
6. Quick share widget

### Technical Debt
1. Add retry logic for failed uploads
2. Implement image compression
3. Add progress indicators for uploads
4. Cache parsed share data
5. Add analytics tracking

## Dependencies

### Core Dependencies
- `expo-linking`: Deep linking
- `expo-router`: Navigation
- `react-native-reanimated`: Animations
- `expo-blur`: Blur effects
- `react-native-toast-message`: Toasts

### Supabase Integration
- `@supabase/supabase-js`: Database
- Custom utilities: `uploadImageToDatabase`, `triggerOCRProcessing`

### Platform APIs
- iOS: `CFBundleDocumentTypes`
- Android: Intent Filters
- Location Services
- File System

## Monitoring

### Metrics to Track
- Share intent success rate
- Average save time
- Image upload success rate
- OCR processing success rate
- User retention after share

### Logging
- Share intent received
- Parse success/failure
- Save operation start/complete
- Upload progress
- Error occurrences

## Conclusion

The share intent architecture provides a robust, performant, and user-friendly way to import content from other apps. The modular design allows for easy testing, maintenance, and future enhancements.
