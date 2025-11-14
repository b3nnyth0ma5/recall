
# Share Recall Implementation

This document describes the implementation of the share recall functionality, which allows users to share notes/recalls with others using the native device sharing feature.

## Overview

The implementation consists of two main features:

1. **Share Recall**: Users can share a recall with others via the native share dialog
2. **View Shared Recall**: Users can open shared recalls and save them as new notes

## Key Components

### 1. Share Utility (`utils/shareRecall.ts`)

This utility file contains the core sharing functionality:

- **`shareRecall(recall, currentImageIndex)`**: Shares a recall using React Native's Share API
  - Creates a deep link with encoded recall data
  - Excludes UUIDs from shared data
  - Includes text, images, location, and metadata
  - The `currentImageIndex` parameter ensures the image the user is viewing becomes the primary image

- **`parseSharedRecallUrl(url)`**: Parses a shared recall deep link URL
  - Extracts and decodes the shared recall data
  - Returns null if the URL is invalid

- **`isSharedRecallUrl(url)`**: Checks if a URL is a shared recall deep link

### 2. Share Icon in NoteCard (`components/NoteCard.tsx`)

Added a share button to each note card:

- Positioned right-aligned, above the location and time row
- Uses the native share icon (iOS: `square.and.arrow.up`, Android: `share`)
- Styled with the app's primary color
- Tracks the current image index in the carousel
- Passes the current image index to `shareRecall()` so the viewed image becomes primary

### 3. Shared Recall Route (`app/shared-recall.tsx`)

A new route that handles incoming shared recall links:

- Parses the shared recall data from URL parameters
- Reorders images to put the primary image first
- Navigates to the note editor with pre-filled data
- Shows a loading indicator while processing

### 4. Note Editor Updates (`app/note-editor.tsx`)

Enhanced the note editor to handle shared recalls:

- Detects when opening a shared recall via `isSharedRecall` parameter
- Pre-fills text, location, and images from shared data
- Changes header title to "Shared Recall" when viewing shared content
- Allows users to edit and save the shared recall as a new note

### 5. Deep Linking Setup (`app/_layout.tsx`)

Added deep link handling:

- Listens for incoming deep links using `expo-linking`
- Detects shared recall URLs
- Routes to the shared-recall screen with appropriate parameters
- Handles both initial URL (app opened from link) and URL changes (app already open)

## Data Structure

### SharedRecallData Interface

```typescript
interface SharedRecallData {
  text: string;
  images: string[]; // CDN URLs
  primaryImageIndex: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  location_primary_type?: string;
  created_at: string;
}
```

**Note**: UUIDs are explicitly excluded from shared data for privacy and security.

## Deep Link Format

Shared recalls use the following deep link format:

```
natively://shared-recall?data=<encoded_json>
```

Where `<encoded_json>` is a URL-encoded JSON string containing the `SharedRecallData`.

## User Flow

### Sharing a Recall

1. User views a note card with images
2. User scrolls through the image carousel to their desired image
3. User taps the share icon
4. The current image becomes the primary image in the shared data
5. Native share dialog appears with a preview message and deep link
6. User selects a sharing method (Messages, Email, etc.)
7. Recipient receives the message with the deep link

### Viewing a Shared Recall

1. Recipient taps the deep link
2. App opens (or switches to) the Recall app
3. Shared recall screen processes the data
4. Images are reordered with the primary image first
5. Note editor opens with pre-filled data
6. User can review, edit, and save as a new note

## Technical Details

### Image Handling

- Shared images use CDN URLs (no local file paths)
- Primary image is determined by the carousel position when sharing
- Images are reordered on the receiving end to show the primary image first
- All images are displayed in the note editor for review

### Location Data

- Location coordinates (latitude/longitude) are included
- Location name and primary type are preserved
- Users can view the location on a map before saving

### Privacy & Security

- No user IDs or database UUIDs are shared
- Only public-facing data (text, images, location) is included
- Recipients create their own copy of the note (no database linking)

## Dependencies

- `expo-sharing`: Native sharing functionality
- `expo-linking`: Deep link handling
- `react-native`: Share API for cross-platform sharing

## Configuration

The app scheme is configured in `app.json`:

```json
{
  "scheme": "natively"
}
```

This allows the app to handle `natively://` deep links.

## Future Enhancements

Potential improvements for future versions:

1. Add share analytics to track sharing activity
2. Support sharing multiple recalls at once
3. Add social media preview images
4. Implement QR code sharing for offline scenarios
5. Add share templates for different platforms
6. Support sharing to specific apps (WhatsApp, Instagram, etc.)
