
export interface Note {
  id: string;
  text: string;
  images: string[]; // Array of CDN URLs for display
  imageIds?: string[]; // Array of image record IDs
  created_at: string;
  updated_at: string;
  latitude?: number;
  longitude?: number;
  location?: string;
  location_primary_type?: string; // Primary type display name from Google Places API
  user_id?: string;
  relevance_score?: number; // AI-powered relevance score (0-100)
  relevance_reason?: string; // Explanation of why this recall matches
}

export interface NoteImage {
  uri: string;
  width: number;
  height: number;
}

export interface SearchHistory {
  id: string;
  user_id: string;
  search_text: string;
  created_at: string;
  updated_at: string;
}

export interface ImageRecord {
  id: string;
  recall_id: string;
  cdn_url: string; // Cloudflare CDN URL
  content_type: string;
  created_at: string;
  user_id: string;
  ocr_text?: string; // Extracted text from OCR
  image_explanation?: string; // AI-generated explanation (under 120 words)
  processed_at?: string; // Timestamp when OCR processing completed
}
