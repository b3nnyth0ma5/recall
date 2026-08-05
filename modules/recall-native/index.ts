import { requireNativeModule } from 'expo-modules-core';

interface ExtractedEntities {
  keywords: string[];
  people: string[];
  location: string;
  locationIntent: 'in' | 'near' | 'near_me' | null;
}

export type FoundationModelsStatus =
  | 'available'
  | 'apple_intelligence_disabled'
  | 'device_not_eligible'
  | 'model_not_ready'
  | 'unavailable';

export interface FaceDetection {
  faceUuid: string;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
  roll: number;
  yaw: number;
}

interface EntityExtractionModuleType {
  extractEntities: (query: string) => Promise<ExtractedEntities>;
  extractPeopleFromText: (text: string) => Promise<string[]>;
  extractTextFromImage: (imageUri: string) => Promise<string>;
  detectFaces: (imageUri: string) => Promise<FaceDetection[]>;
  detectFacesFromData: (base64ImageData: string) => Promise<FaceDetection[]>;
  extractFaceEmbedding: (imageUri: string, bboxX: number, bboxY: number, bboxW: number, bboxH: number) => Promise<number[]>;
  extractFaceEmbeddingFromData: (base64ImageData: string, bboxX: number, bboxY: number, bboxW: number, bboxH: number) => Promise<number[]>;
}

let _module: EntityExtractionModuleType | null = null;

let _fmModule: {
  checkAvailability: () => Promise<string>;
  generateAnswer: (contextString: string, query: string, uploadedImagesContext: string) => Promise<{ answer: string; confidence: number; sources: string[]; durationMs: number }>;
} | null = null;

function getFoundationModelModule() {
  if (!_fmModule) {
    try {
      _fmModule = requireNativeModule('FoundationModelAnswerModule');
    } catch (e) {
      console.warn('[FoundationModelAnswer] Native module not available (requires a new native build):', e);
      _fmModule = null;
    }
  }
  return _fmModule;
}

function getModule() {
  if (!_module) {
    try {
      _module = requireNativeModule('EntityExtractionModule');
    } catch (e) {
      console.warn('[EntityExtraction] Native module not available (requires a new native build):', e);
      _module = null;
    }
  }
  return _module;
}

export async function extractEntitiesOnDevice(query: string): Promise<ExtractedEntities | null> {
  console.log('[EntityExtraction] extractEntitiesOnDevice called with query:', query);
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning null');
    return null;
  }
  try {
    const result = await mod.extractEntities(query);
    console.log('[EntityExtraction] extractEntities result:', result);
    return result;
  } catch (e) {
    console.error('[EntityExtraction] extractEntities error:', e);
    return null;
  }
}

export async function extractPeopleFromTextOnDevice(text: string): Promise<string[] | null> {
  console.log('[EntityExtraction] extractPeopleFromTextOnDevice called, text length:', text.length);
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning null');
    return null;
  }
  try {
    const result = await mod.extractPeopleFromText(text);
    console.log('[EntityExtraction] extractPeopleFromText result:', result);
    return result;
  } catch (e) {
    console.error('[EntityExtraction] extractPeopleFromText error:', e);
    return null;
  }
}

export async function extractTextFromImageOnDevice(imageUri: string): Promise<string | null> {
  console.log('[EntityExtraction] extractTextFromImageOnDevice called:', imageUri);
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning null');
    return null;
  }
  try {
    const result = await mod.extractTextFromImage(imageUri);
    console.log('[EntityExtraction] extractTextFromImage result length:', result?.length ?? 0);
    return result;
  } catch (e) {
    console.error('[EntityExtraction] extractTextFromImage error:', e);
    return null;
  }
}

export async function detectFacesOnDevice(imageUri: string): Promise<FaceDetection[] | null> {
  console.log('[EntityExtraction] detectFacesOnDevice called:', imageUri);
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning null');
    return null;
  }
  try {
    const result = await mod.detectFaces(imageUri);
    console.log('[EntityExtraction] detectFaces result count:', result?.length ?? 0);
    return result;
  } catch (e) {
    console.error('[EntityExtraction] detectFaces error:', e);
    return null;
  }
}

export async function extractFaceEmbeddingOnDevice(
  imageUri: string,
  bboxX: number,
  bboxY: number,
  bboxW: number,
  bboxH: number,
): Promise<number[] | null> {
  console.log('[EntityExtraction] extractFaceEmbeddingOnDevice called:', imageUri, { bboxX, bboxY, bboxW, bboxH });
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning null');
    return null;
  }
  try {
    const result = await mod.extractFaceEmbedding(imageUri, bboxX, bboxY, bboxW, bboxH);
    const arr = result;
    if (!arr || arr.length === 0) {
      console.log('[EntityExtraction] extractFaceEmbedding returned empty array');
      return null;
    }
    console.log('[EntityExtraction] extractFaceEmbedding returned', arr.length, 'floats');
    return arr;
  } catch (e) {
    console.error('[EntityExtraction] extractFaceEmbedding error:', e);
    return null;
  }
}

export async function detectFacesFromData(base64ImageData: string): Promise<FaceDetection[]> {
  console.log('[EntityExtraction] detectFacesFromData called, base64 length:', base64ImageData.length);
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning []');
    return [];
  }
  try {
    const result = await mod.detectFacesFromData(base64ImageData);
    console.log('[EntityExtraction] detectFacesFromData result count:', result?.length ?? 0);
    return result ?? [];
  } catch (e) {
    console.error('[EntityExtraction] detectFacesFromData error:', e);
    return [];
  }
}

export async function extractFaceEmbeddingFromData(
  base64ImageData: string,
  bboxX: number,
  bboxY: number,
  bboxW: number,
  bboxH: number,
): Promise<number[]> {
  console.log('[EntityExtraction] extractFaceEmbeddingFromData called', { bboxX, bboxY, bboxW, bboxH });
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning []');
    return [];
  }
  try {
    const result = await mod.extractFaceEmbeddingFromData(base64ImageData, bboxX, bboxY, bboxW, bboxH);
    if (!result || result.length === 0) {
      console.log('[EntityExtraction] extractFaceEmbeddingFromData returned empty array');
      return [];
    }
    console.log('[EntityExtraction] extractFaceEmbeddingFromData returned', result.length, 'floats');
    return result;
  } catch (e) {
    console.error('[EntityExtraction] extractFaceEmbeddingFromData error:', e);
    return [];
  }
}

export async function checkFoundationModelsAvailability(): Promise<FoundationModelsStatus> {
  console.log('[FoundationModelAnswer] checkFoundationModelsAvailability called');
  const mod = getFoundationModelModule();
  if (!mod) {
    console.log('[FoundationModelAnswer] Native module not available, returning unavailable');
    return 'unavailable';
  }
  try {
    const status = await mod.checkAvailability();
    console.log('[FoundationModelAnswer] checkAvailability result:', status);
    return status as FoundationModelsStatus;
  } catch (e) {
    console.error('[FoundationModelAnswer] checkAvailability error:', e);
    return 'unavailable';
  }
}

export async function generateAnswerOnDevice(
  contextString: string,
  query: string,
  uploadedImagesContext: string,
): Promise<{ answer: string; confidence: number; sources: string[]; durationMs: number } | null> {
  console.log('[FoundationModelAnswer] generateAnswerOnDevice called, query:', query, 'contextLength:', contextString.length);
  const mod = getFoundationModelModule();
  if (!mod) {
    console.log('[FoundationModelAnswer] Native module not available, returning null');
    return null;
  }
  try {
    const result = await mod.generateAnswer(contextString, query, uploadedImagesContext);
    console.log('[FoundationModelAnswer] generateAnswer result: answer length:', result?.answer?.length ?? 0, 'confidence:', result?.confidence, 'durationMs:', result?.durationMs);
    return result;
  } catch (e) {
    console.error('[FoundationModelAnswer] generateAnswer error:', e);
    return null;
  }
}

export {
  getAppGroupContainerPath,
  verifyAppGroupContainer,
  writeTokenFile,
  deleteTokenFile,
  verifyKeychainItem,
  getDiagnostics,
  readLastShareExtensionError,
  clearLastShareExtensionError,
} from './src/AppGroupModule';
export type { AppGroupDiagnostics, ContainerVerification } from './src/AppGroupModule';

export type { ExtractedEntities };
