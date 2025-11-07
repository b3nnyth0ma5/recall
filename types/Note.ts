
export interface Note {
  id: string;
  text: string;
  images: string[];
  created_at: string;
  updated_at: string;
  latitude?: number;
  longitude?: number;
  location?: string;
}

export interface NoteImage {
  uri: string;
  width: number;
  height: number;
}
