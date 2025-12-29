
# Image Sorting and Markdown Rendering Implementation

## Overview
This document describes the implementation of two key features for the search results page:
1. **Image Sorting by Match Percentage**: Images in recall cards are now sorted by their similarity/match percentage (highest first) on the search results page only.
2. **Markdown Rendering in Answer Component**: The AI-generated answer now supports rich text formatting using markdown.

## Changes Made

### 1. Dependencies
- **Added**: `react-native-markdown-display` for markdown rendering support

### 2. Type Definitions (`types/Note.ts`)
- Added `ImageMatchData` interface to store image match information:
  ```typescript
  export interface ImageMatchData {
    id: string;
    similarity: number; // Match percentage (0-1)
    ocr_text?: string;
    image_explanation?: string;
  }
  ```
- Added `imageMatchData?: ImageMatchData[]` field to `Note` interface

### 3. Search Hook (`hooks/useNotes.ts`)
- Modified search results processing to preserve image match data from keyword search
- Image match data is extracted from `keywordRecalls` and attached to each note
- Match data is preserved through the image loading process
- The `imageMatchData` array contains similarity scores for each image

### 4. Note Card Component (`components/NoteCard.tsx`)
- Added `isSearchResult?: boolean` prop to indicate when card is displayed on search results page
- Implemented `useMemo` hook to sort images by similarity when `isSearchResult` is true
- Images are sorted in descending order by similarity (highest match first)
- Both image URLs and image IDs are sorted together to maintain consistency
- Sorting only applies on search results page - other pages show images in original order
- Added console logging to track image sorting for debugging

**Key Implementation Details**:
```typescript
const { displayImages, sortedImageIds } = useMemo(() => {
  // Create array with image data and similarity scores
  const imageDataArray = Array.from({ length: totalImageCount }, (_, index) => {
    // ... get image URL and match data
    return {
      url: imageUrl,
      originalIndex: index,
      similarity,
      imageId,
    };
  });

  // Sort by similarity ONLY on search results page
  if (isSearchResult && note.imageMatchData && note.imageMatchData.length > 0) {
    imageDataArray.sort((a, b) => b.similarity - a.similarity);
  }

  return {
    displayImages: imageDataArray.map(img => img.url),
    sortedImageIds: imageDataArray.map(img => img.imageId),
  };
}, [totalImageCount, lazyLoadedImages, note.images, note.imageMatchData, note.imageIds, note.id, isSearchResult]);
```

### 5. Search Screen (`app/search.tsx`)
- Added `react-native-markdown-display` import
- Updated answer component to use `<Markdown>` component instead of plain `<Text>`
- Added comprehensive markdown styles for:
  - Body text
  - Paragraphs
  - Bold (`**text**`) and italic (`*text*`)
  - Bullet lists and ordered lists
  - Inline code and code blocks
  - Links
  - Blockquotes
- All NoteCard components on search results page now receive `isSearchResult={true}` prop
- Markdown styles match the app's color scheme and design system

**Markdown Styles**:
- Body text: 16px, line height 24px
- Code blocks: Dark background with monospace font
- Links: Primary color with underline
- Blockquotes: Light primary background with left border
- Lists: Proper spacing and indentation

### 6. Image Sorting Logic
The sorting algorithm works as follows:
1. When `isSearchResult` is true and `imageMatchData` is available:
   - Create array of image objects with URL, ID, and similarity score
   - Sort array by similarity in descending order (highest first)
   - Return sorted URLs and IDs
2. When `isSearchResult` is false or no match data:
   - Return images in original order
3. Sorting is memoized for performance

### 7. Data Flow
```
Search Query
    ↓
search-recalls-with-keywords (returns images_data with similarity)
    ↓
search-recalls-v2 (combines all results)
    ↓
useNotes.searchNotes (extracts imageMatchData from keywordRecalls)
    ↓
NoteCard (sorts images by similarity if isSearchResult=true)
    ↓
Display (images shown in order of match percentage)
```

## Testing Recommendations

### Image Sorting
1. Perform a search that returns recalls with multiple images
2. Verify images are sorted by match percentage (highest first)
3. Check console logs for sorting confirmation
4. Navigate to home page and verify images are in original order
5. Return to search results and verify sorting is maintained

### Markdown Rendering
1. Test various markdown formats in search answers:
   - **Bold text**
   - *Italic text*
   - Bullet lists
   - Numbered lists
   - `Inline code`
   - Code blocks
   - [Links](https://example.com)
   - > Blockquotes
2. Verify all formats render correctly
3. Check that colors match the app theme
4. Test expand/collapse functionality with markdown content

## Performance Considerations
- Image sorting uses `useMemo` to prevent unnecessary recalculations
- Sorting only occurs when `isSearchResult` flag is true
- Markdown rendering is optimized by the library
- No impact on non-search pages

## Backward Compatibility
- All changes are backward compatible
- `isSearchResult` prop defaults to `false`
- `imageMatchData` is optional
- Existing functionality remains unchanged

## Future Enhancements
1. Add visual indicators for high-match images (e.g., badges)
2. Support more markdown features (tables, task lists)
3. Add image match percentage overlay on search results
4. Implement image filtering by match threshold
