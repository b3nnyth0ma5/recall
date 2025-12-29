
# Image Sorting and Markdown Implementation Summary

## Overview
This document summarizes the implementation of two key features:
1. **Image Sorting on Search Results**: Images in recall cards on the search results page are now sorted by their match percentage (highest first)
2. **Markdown Answer Display**: The answer component on the search results page now renders rich text/markdown content

## Changes Made

### 1. Type Definitions (`types/Note.ts`)
- Added `ImageMatchData` interface to store image match information:
  - `imageId`: The ID of the image
  - `similarity`: Match percentage (0-1)
  - `ocr_text`: OCR text from the image
  - `image_explanation`: AI-generated explanation
- Added `imageMatchData` property to the `Note` interface (optional array of `ImageMatchData`)

### 2. Markdown Answer Component (`components/MarkdownAnswer.tsx`)
- Created new component using `react-native-markdown-display` library
- Styled to match the app's design system with:
  - Custom heading styles (h1-h6)
  - Styled lists (bullet and ordered)
  - Code blocks with monospace font
  - Blockquotes with left border
  - Links with primary color
  - Tables with borders
  - Proper spacing and colors from `commonStyles`

### 3. NoteCard Component Updates (`components/NoteCard.tsx`)
- Added `isSearchResult` prop to indicate when a card is displayed on search results
- Implemented image sorting logic:
  - When `isSearchResult` is true and `imageMatchData` is available, images are sorted by similarity (highest first)
  - Original image order is preserved for non-search pages
  - Uses `useMemo` for performance optimization
- Added match percentage badge overlay on images in search results:
  - Displays as "X% match" in top-left corner
  - Only shown when similarity > 0
  - Styled with primary color background
- Updated lazy loading to work with sorted images:
  - Maintains mapping between sorted indices and original indices
  - Loads first two images in sorted order for search results
  - Prefetches next image as user scrolls

### 4. Search Screen Updates (`app/search.tsx`)
- Integrated `MarkdownAnswer` component for answer display:
  - Replaces plain text rendering
  - Supports expand/collapse functionality
  - Maintains preview mode (first 3 lines)
- Updated `NoteCard` usage to pass `isSearchResult={true}` flag
- Answer content now properly renders:
  - Bold text
  - Italic text
  - Lists (bullet and numbered)
  - Links
  - Code blocks
  - Headings
  - Blockquotes

### 5. useNotes Hook Updates (`hooks/useNotes.ts`)
- Modified `loadImagesForRecalls` to accept optional `imageMatchDataMap` parameter
- Extracts image match data from keyword search results:
  - Creates map of recall_id to array of `ImageMatchData`
  - Includes similarity scores, OCR text, and explanations
- Passes image match data through to processed notes:
  - Only for search results (not regular note loading)
  - Attached to each note as `imageMatchData` property
- Image match data flows from search results → notes → NoteCard

## Technical Details

### Image Sorting Algorithm
1. When `isSearchResult` is true, create a sorted array of image data:
   - Map each imageId to its match data (similarity score)
   - Sort by similarity in descending order (highest match first)
   - Maintain original index for reference
2. Display images in sorted order in the carousel
3. When user taps an image, convert sorted index back to original index for full-screen view
4. Lazy loading respects sorted order

### Markdown Rendering
- Uses `react-native-markdown-display` library (v7.0.2)
- Custom styles defined for all markdown elements
- Integrates with app's color scheme from `commonStyles`
- Supports all common markdown syntax:
  - Headers (# ## ### etc.)
  - Bold (**text**)
  - Italic (*text*)
  - Lists (- item or 1. item)
  - Links ([text](url))
  - Code (`inline` or ```block```)
  - Blockquotes (> text)
  - Tables
  - Horizontal rules (---)

### Performance Considerations
- Image sorting uses `useMemo` to prevent unnecessary recalculations
- Markdown component is lightweight and efficient
- Image match data is only computed for search results
- Lazy loading still works efficiently with sorted images

## User Experience Improvements

### Search Results Page
1. **Better Image Relevance**: Users immediately see the most relevant images first in each recall card
2. **Visual Feedback**: Match percentage badges show how well each image matches the search query
3. **Rich Answers**: Markdown formatting makes answers more readable with proper structure
4. **Consistent Behavior**: Image order on other pages (home, note editor) remains unchanged

### Answer Display
1. **Formatted Text**: Proper headings, lists, and emphasis make answers easier to scan
2. **Clickable Links**: URLs in answers are properly formatted and clickable
3. **Code Highlighting**: Code snippets are displayed in monospace font with background
4. **Better Structure**: Lists and blockquotes provide visual hierarchy

## Testing Recommendations

1. **Image Sorting**:
   - Search for queries that match images (e.g., "dog", "receipt", "document")
   - Verify images are sorted by match percentage
   - Check that image counter still works correctly
   - Confirm full-screen view shows correct image
   - Test on recalls with multiple images

2. **Markdown Rendering**:
   - Search for queries that generate formatted answers
   - Test expand/collapse functionality
   - Verify all markdown elements render correctly
   - Check that links are clickable
   - Test on different screen sizes

3. **Performance**:
   - Test with large result sets (20+ recalls)
   - Verify smooth scrolling
   - Check memory usage
   - Confirm lazy loading still works

## Dependencies Added
- `react-native-markdown-display`: ^7.0.2

## Files Modified
1. `types/Note.ts` - Added ImageMatchData interface
2. `components/MarkdownAnswer.tsx` - New component
3. `components/NoteCard.tsx` - Image sorting logic
4. `app/search.tsx` - Markdown integration
5. `hooks/useNotes.ts` - Image match data flow

## Linting Status
All changes maintain good linting practices:
- No unused variables
- Proper TypeScript types
- Consistent formatting
- No console errors
- Proper React hooks usage
