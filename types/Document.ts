export type Document = {
  id?: string;
  cdn_url?: string;
  thumbnail_url?: string;
  file_name: string;
  file_size?: number;
  content_type: string;
  page_count?: number;
  extracted_text?: string;
  doc_explanation?: string;
  processed_at?: string;
  created_at?: string;
  // local-only fields used during upload
  local_uri?: string;
  local_thumbnail_uri?: string;
  upload_state?: 'pending' | 'uploading' | 'uploaded' | 'failed';
};
