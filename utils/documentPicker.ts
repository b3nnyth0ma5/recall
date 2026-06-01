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
          console.log('[DocumentPicker] Generating PDF thumbnail for:', asset.name, 'uri:', asset.uri);
          // Normalise URI: react-native-pdf-thumbnail needs a file:// URI
          let pdfUri = asset.uri;
          if (!pdfUri.includes('://')) {
            pdfUri = `file://${pdfUri}`;
            console.log('[DocumentPicker] Prepended file:// to URI:', pdfUri);
          } else if (!pdfUri.startsWith('file://')) {
            console.log('[DocumentPicker] Non-file URI scheme detected, attempting anyway:', pdfUri);
          }
          // Dynamic import to avoid crashing on platforms where native module is unavailable
          const PdfThumbnail = require('react-native-pdf-thumbnail').default;
          const result = await PdfThumbnail.generate(pdfUri, 0);
          thumbnailUri = result.uri;
          console.log('[DocumentPicker] ✅ PDF thumbnail generated at:', thumbnailUri);
        } catch (e: any) {
          console.error('[DocumentPicker] ❌ PDF thumbnail generation failed for', asset.name, '— error:', e?.message ?? e);
          // Don't rethrow — leave thumbnailUri undefined; server-side fallback will fill it in.
        }
      }

      const normalizedName = normalizeDocumentFileName(asset.name, asset.mimeType ?? 'application/octet-stream');

      valid.push({
        uri: asset.uri,
        name: normalizedName,
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
 * Returns the canonical file extension for a MIME type, or null if unknown.
 */
function canonicalExtensionForMime(mime: string): string | null {
  const m = (mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/msword') return 'doc';
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (m === 'application/vnd.ms-excel') return 'xls';
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (m === 'application/vnd.ms-powerpoint') return 'ppt';
  if (m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (m === 'text/plain') return 'txt';
  if (m === 'text/markdown') return 'md';
  if (m === 'text/csv') return 'csv';
  return null;
}

/**
 * Ensures a file name has exactly one trailing extension that matches the MIME type.
 * - If name already ends with the correct extension (case-insensitive), returns name unchanged.
 * - If name ends with a different/wrong extension, leaves it alone (don't second-guess the user).
 * - If name has no extension at all, appends the canonical one for the mime type.
 * - Strips trailing duplicates like `report.pdf.pdf` → `report.pdf`.
 */
export function normalizeDocumentFileName(name: string, mimeType: string): string {
  if (!name) return name;
  const canonical = canonicalExtensionForMime(mimeType);
  if (!canonical) return name;
  const lower = name.toLowerCase();
  // Strip trailing duplicate: `foo.pdf.pdf` -> `foo.pdf`
  const dupSuffix = `.${canonical}.${canonical}`;
  if (lower.endsWith(dupSuffix)) {
    const fixed = name.slice(0, name.length - canonical.length - 1);
    console.log(`[DocumentPicker] normalizeDocumentFileName: stripped duplicate extension "${name}" → "${fixed}"`);
    return fixed;
  }
  // Already correctly extended
  if (lower.endsWith(`.${canonical}`)) return name;
  // No extension at all -> append
  if (!name.includes('.')) {
    const fixed = `${name}.${canonical}`;
    console.log(`[DocumentPicker] normalizeDocumentFileName: appended extension "${name}" → "${fixed}"`);
    return fixed;
  }
  return name;
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
