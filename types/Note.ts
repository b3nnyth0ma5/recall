
import { Document } from './Document';

export interface Note {
  id: string;
  text: string;                  // plain text — kept for embeddings/search
  images?: string[]; // Array of CDN URLs for display
  imageIds?: string[]; // Array of image record IDs
  created_at: string;
  updated_at: string;
  latitude?: number | null;
  longitude?: number | null;
  location?: string | null;
  location_primary_type?: string | null; // Primary type display name from Google Places API
  user_id?: string;
  relevance_score?: number; // AI-powered relevance score (0-100)
  relevance_reason?: string; // Explanation of why this recall matches
  used_for_answer?: boolean; // Whether this recall was used to derive the AI answer
  people?: Person[]; // People mentioned in this recall
  documents?: Document[]; // Documents attached to this recall
  documentIds?: string[]; // Array of document record IDs
  category_matching_at?: string | null; // Set when category matching starts
  category_matched_at?: string | null;  // Set when category matching completes
}

export interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
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
  collage_cdn_url?: string | null;   // Cloudflare Images collage thumbnail
  has_uploads?: boolean;             // Whether this search had image attachments
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
