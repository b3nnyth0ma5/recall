import * as DocumentPicker from 'expo-document-picker';
import Toast from 'react-native-toast-message';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
];

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export interface PickedDocument {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  thumbnailUri?: string;
}

export async function pickDocuments(): Promise<PickedDocument[]> {
  console.log('[DocumentPicker] User tapped Upload Document button');
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_TYPES,
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (result.canceled) {
      console.log('[DocumentPicker] User cancelled document picker');
      return [];
    }

    console.log('[DocumentPicker] User selected', result.assets.length, 'document(s)');

    const valid: PickedDocument[] = [];
    for (const asset of result.assets) {
      if (asset.size && asset.size > MAX_SIZE) {
        console.warn('[DocumentPicker] File too large, skipping:', asset.name, asset.size);
        Toast.show({
          type: 'error',
          text1: 'File too large',
          text2: `${asset.name} exceeds the 25MB limit`,
          position: 'bottom',
        });
        continue;
      }

      let thumbnailUri: string | undefined;
      if (asset.mimeType === 'application/pdf') {
        try {
          console.log('[DocumentPicker] Generating PDF thumbnail for:', asset.name);
          // Dynamic import to avoid crashing on platforms where native module is unavailable
          const PdfThumbnail = require('react-native-pdf-thumbnail').default;
          const { uri } = await PdfThumbnail.generate(asset.uri, 0);
          thumbnailUri = uri;
          console.log('[DocumentPicker] PDF thumbnail generated:', thumbnailUri);
        } catch (e) {
          console.warn('[DocumentPicker] PDF thumbnail generation failed:', e);
        }
      }

      valid.push({
        uri: asset.uri,
        name: asset.name,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        thumbnailUri,
      });
    }

    console.log('[DocumentPicker] Returning', valid.length, 'valid document(s)');
    return valid;
  } catch (error) {
    console.error('[DocumentPicker] Error picking documents:', error);
    return [];
  }
}

/**
 * Returns a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns the file extension in uppercase (e.g. ".PDF", ".DOCX").
 */
export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length < 2) return '';
  return `.${parts[parts.length - 1].toUpperCase()}`;
}

/**
 * Returns a colour for a given MIME type — used for document tiles without thumbnails.
 */
export function getDocumentColor(mimeType: string): string {
  if (mimeType === 'application/pdf') return '#E53935';
  if (mimeType.includes('word')) return '#1565C0';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '#2E7D32';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '#E65100';
  if (mimeType.includes('text')) return '#6A1B9A';
  return '#37474F';
}
