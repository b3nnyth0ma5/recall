
# Combined Add/Search Feature Implementation

## Overview
This document describes the implementation of the new combined add/search functionality, which provides a unified interface for creating recalls and searching, accessible via a feature toggle.

## Features Implemented

### 1. User Preferences Table
- Created `user_preferences` table in the database
- Stores feature toggle state per user
- Includes RLS policies for security
- Auto-updates `updated_at` timestamp

### 2. Feature Toggle in Profile Screen
- Added "Experimental Features" section
- Toggle for "Combined Add/Search" feature
- Requires app restart to take effect
- Persists preference to database

### 3. Combined Search/Add Component (`components/CombinedSearchAdd.tsx`)
The new component provides:

#### UI Elements
- **Text Input**: Multi-line input for typing text
- **Plus Button**: Opens slide-up drawer with options
- **Search Button**: Quick access to search
- **Microphone Button**: Speech-to-text (placeholder - requires additional library)
- **Submit Button**: Creates recall with text, images, and location
- **Search Text Display**: Shows typed text above input, clickable to navigate to search

#### Slide-up Drawer
Opens when plus button is clicked, provides three options:
- **Image**: Pick images from photo library
- **Camera**: Take a photo with camera
- **Location**: Navigate to location search screen

#### Image Display
- Shows uploaded/captured images in horizontal scroll
- Each image has remove button (X)
- Supports multiple images

#### Location Display
- Shows selected location as a chip
- Displays location name
- Has remove button (X)

### 4. Integration with Home Screen
- Loads user preferences on mount
- Conditionally shows CombinedSearchAdd component when feature is enabled
- Hides traditional FABs (search and add) when feature is enabled
- Handles recall creation from the combined component
- Uploads images to Cloudflare CDN
- Refreshes notes list after creation

### 5. Search Screen Integration
- Accepts `query` parameter from URL
- Automatically performs search when navigating from combined component
- Decodes URL-encoded query text

## Technical Details

### Database Schema
```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  combined_add_search_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### Component Props
```typescript
interface CombinedSearchAddProps {
  onCreateRecall: (data: {
    text: string;
    images: string[];
    location?: { latitude: number; longitude: number; name: string };
  }) => Promise<void>;
  userId: string;
}
```

### Navigation Flow
1. User types text → Text appears in search display above input
2. User clicks search display → Navigates to `/search?query=<text>`
3. User clicks plus → Opens drawer with image/camera/location options
4. User selects location → Navigates to `/location-search`
5. User returns from location → Location chip appears in component
6. User clicks submit → Creates recall with all data

## Limitations & Future Enhancements

### Current Limitations
1. **Speech-to-Text**: Not implemented - requires additional library like `@react-native-voice/voice`
2. **Web Support**: Component is designed for native platforms
3. **App Restart Required**: Feature toggle requires app restart to take effect

### Suggested Enhancements
1. Implement proper speech-to-text using a library
2. Add animation when transitioning between states
3. Add haptic feedback for all interactions
4. Support for video uploads
5. Support for voice notes
6. Auto-save drafts
7. Rich text formatting
8. Emoji picker
9. Mention people (@mentions)
10. Tag suggestions

## Usage Instructions

### For Users
1. Go to Profile screen
2. Find "Experimental Features" section
3. Toggle "Combined Add/Search" on
4. Restart the app
5. New UI appears at the top of the home screen

### For Developers
1. Component is located at `components/CombinedSearchAdd.tsx`
2. Integration is in `app/(tabs)/(home)/index.tsx`
3. Feature toggle is in `app/(tabs)/profile.tsx`
4. Database migration is in the migration history

## Testing Checklist
- [ ] Toggle feature on/off in profile
- [ ] Create recall with text only
- [ ] Create recall with images only
- [ ] Create recall with location only
- [ ] Create recall with all three
- [ ] Search from the component
- [ ] Remove images before submitting
- [ ] Remove location before submitting
- [ ] Test on iOS
- [ ] Test on Android
- [ ] Verify database persistence
- [ ] Verify image upload to CDN
- [ ] Verify location selection

## Known Issues
1. Speech-to-text shows alert instead of working
2. Web version not implemented (uses traditional FABs)
3. Requires app restart for toggle to take effect

## Dependencies
- `expo-image-picker`: For image selection and camera
- `expo-haptics`: For haptic feedback
- `react-native-reanimated`: For animations
- `expo-router`: For navigation

## Files Modified
1. `app/(tabs)/profile.tsx` - Added feature toggle
2. `app/(tabs)/(home)/index.tsx` - Integrated combined component
3. `app/search.tsx` - Added query parameter handling
4. `components/CombinedSearchAdd.tsx` - New component (created)
5. Database - Added `user_preferences` table

## Migration Applied
- Migration name: `create_user_preferences_table`
- Creates table with RLS policies
- Adds indexes for performance
- Includes trigger for auto-updating timestamps
