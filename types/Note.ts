
export interface Note {
  id: string;
  text: string;
  images: string[]; // Array of public URLs for display
  imagePaths?: string[]; // Array of storage paths
  imageIds?: string[]; // Array of image record IDs
  created_at: string;
  updated_at: string;
  latitude?: number;
  longitude?: number;
  location?: string;
  user_id?: string;
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
  image_path: string; // Path in Supabase Storage
  image_data?: any; // Deprecated: Legacy binary data
  content_type: string;
  created_at: string;
}
