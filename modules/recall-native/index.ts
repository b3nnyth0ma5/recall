import { requireNativeModule } from 'expo-modules-core';

interface ExtractedEntities {
  keywords: string[];
  people: string[];
  location: string;
  locationIntent: 'in' | 'near' | 'near_me' | null;
}

let _module: { extractEntities: (query: string) => Promise<ExtractedEntities> } | null = null;

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
    const result = await (mod as any).extractPeopleFromText(text);
    console.log('[EntityExtraction] extractPeopleFromText result:', result);
    return result as string[];
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
    const result = await (mod as any).extractTextFromImage(imageUri);
    console.log('[EntityExtraction] extractTextFromImage result length:', (result as string)?.length ?? 0);
    return result as string;
  } catch (e) {
    console.error('[EntityExtraction] extractTextFromImage error:', e);
    return null;
  }
}

export interface FaceDetection {
  faceUuid: string;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
  roll: number;
  yaw: number;
}

export async function detectFacesOnDevice(imageUri: string): Promise<FaceDetection[] | null> {
  console.log('[EntityExtraction] detectFacesOnDevice called:', imageUri);
  const mod = getModule();
  if (!mod) {
    console.log('[EntityExtraction] Native module not available, returning null');
    return null;
  }
  try {
    const result = await (mod as any).detectFaces(imageUri);
    console.log('[EntityExtraction] detectFaces result count:', (result as FaceDetection[])?.length ?? 0);
    return result as FaceDetection[];
  } catch (e) {
    console.error('[EntityExtraction] detectFaces error:', e);
    return null;
  }
}

export { getAppGroupContainerPath, verifyAppGroupContainer } from './src/AppGroupModule';

export type { ExtractedEntities };
