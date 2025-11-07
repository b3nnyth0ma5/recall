
export interface Note {
  id: string;
  text: string;
  images: string[];
  imagePaths?: string[]; // Kept for backward compatibility
  imageIds?: string[]; // New field for image record IDs
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
