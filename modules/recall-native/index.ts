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
    } catch {
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

export type { ExtractedEntities };
