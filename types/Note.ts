
export interface Note {
  id: string;
  title: string;
  content: string;
  images: string[];
  createdAt: number;
  updatedAt: number;
  synced?: boolean;
}

export interface NoteImage {
  uri: string;
  width: number;
  height: number;
}
