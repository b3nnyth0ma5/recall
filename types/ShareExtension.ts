
/**
 * Type definitions for Share Extension functionality
 */

/**
 * Shared data structure from iOS Share Extension
 */
export interface SharedData {
  /** Plain text content */
  text?: string;
  
  /** Array of URL strings */
  urls?: string[];
  
  /** Array of image file paths */
  images?: string[];
  
  /** Array of video file paths */
  videos?: string[];
  
  /** Array of other file paths (PDFs, documents, etc.) */
  files?: string[];
  
  /** Timestamp when the data was shared */
  timestamp?: number;

  /** Recall ID if the native extension already saved the recall (skip insert, run pipeline only) */
  recall_id?: string;
  /** True if the native extension already inserted the recall row */
  already_saved?: boolean;
  /** Document file names (parallel array to files) */
  documentNames?: string[];
}

/**
 * Received share data (processed and ready for use)
 */
export interface ReceivedShareData {
  /** Plain text content */
  text?: string;
  
  /** Array of image URIs (local file paths or URLs) */
  images?: string[];
  
  /** Array of URL strings */
  urls?: string[];
  
  /** Array of video URIs */
  videos?: string[];
  
  /** Array of file URIs */
  files?: string[];
}

/**
 * Share Extension Module interface
 */
export interface ShareExtensionModule {
  /**
   * Get shared data from the Share Extension
   * @returns Promise resolving to shared data or null
   */
  getSharedData(): Promise<SharedData | null>;
  
  /**
   * Clear shared data after processing
   * @returns Promise resolving to true if successful
   */
  clearSharedData(): Promise<boolean>;
  
  /**
   * Get the shared container URL
   * @returns The path to the shared container or null
   */
  getSharedContainerURL(): string | null;
}

/**
 * Share intent listener callback
 */
export type ShareIntentCallback = (shareData: ReceivedShareData) => void;

/**
 * Share intent listener cleanup function
 */
export type ShareIntentCleanup = () => void;

/**
 * Content type for share extension
 */
export enum ShareContentType {
  Text = 'text',
  URL = 'url',
  Image = 'image',
  Video = 'video',
  PDF = 'pdf',
  File = 'file',
}

/**
 * Share extension error types
 */
export enum ShareExtensionError {
  NoContent = 'NO_CONTENT',
  InvalidData = 'INVALID_DATA',
  ContainerAccessFailed = 'CONTAINER_ACCESS_FAILED',
  FileNotFound = 'FILE_NOT_FOUND',
  PermissionDenied = 'PERMISSION_DENIED',
  UnsupportedType = 'UNSUPPORTED_TYPE',
}

/**
 * Share extension configuration
 */
export interface ShareExtensionConfig {
  /** App Group identifier */
  appGroupId: string;
  
  /** URL scheme for deep linking */
  urlScheme: string;
  
  /** Maximum number of images to accept */
  maxImages: number;
  
  /** Maximum number of videos to accept */
  maxVideos: number;
  
  /** Maximum file size in bytes */
  maxFileSize: number;
  
  /** Supported image formats */
  supportedImageFormats: string[];
  
  /** Supported video formats */
  supportedVideoFormats: string[];
  
  /** Supported document formats */
  supportedDocumentFormats: string[];
}

/**
 * Default share extension configuration
 */
export const DEFAULT_SHARE_EXTENSION_CONFIG: ShareExtensionConfig = {
  appGroupId: 'group.com.anonymous.Natively',
  urlScheme: 'natively',
  maxImages: 10,
  maxVideos: 5,
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  supportedImageFormats: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'gif', 'webp', 'tiff', 'bmp'],
  supportedVideoFormats: ['mp4', 'mov', 'm4v', 'avi', 'mkv'],
  supportedDocumentFormats: ['pdf', 'txt', 'rtf', 'doc', 'docx'],
};

/**
 * Share extension status
 */
export interface ShareExtensionStatus {
  /** Whether the Share Extension is available */
  available: boolean;
  
  /** Whether there is pending shared data */
  hasPendingData: boolean;
  
  /** Last error if any */
  lastError?: string;
  
  /** Shared container path */
  containerPath?: string;
}

/**
 * Share extension metrics
 */
export interface ShareExtensionMetrics {
  /** Total number of shares */
  totalShares: number;
  
  /** Number of text shares */
  textShares: number;
  
  /** Number of URL shares */
  urlShares: number;
  
  /** Number of image shares */
  imageShares: number;
  
  /** Number of video shares */
  videoShares: number;
  
  /** Number of file shares */
  fileShares: number;
  
  /** Average processing time in ms */
  averageProcessingTime: number;
  
  /** Number of errors */
  errorCount: number;
}

/**
 * Share source information
 */
export interface ShareSource {
  /** Source app bundle identifier */
  bundleId?: string;
  
  /** Source app name */
  appName?: string;
  
  /** Share timestamp */
  timestamp: number;
  
  /** Content types shared */
  contentTypes: ShareContentType[];
}
