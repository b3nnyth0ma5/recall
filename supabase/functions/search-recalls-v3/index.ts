
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Threshold configuration
const TEXT_SIMILARITY_THRESHOLD = 0.4;
const IMAGE_SIMILARITY_THRESHOLD = 0.25;

interface ExtractedEntities {
  keywords: string[];
  people: string[];
  location: string;
  locationIntent: 'in' | 'near' | 'near_me' | null;
}

interface RecallMatch {
  recall_id: string;
  text_similarity: number;
  image_similarities: number[];
  keyword_matches: number;
  recall_data: {
    text: string;
    location: string;
    location_primary_type: string;
    created_at: string;
  };
  images_data: Array<{
    id: string;
    ocr_text: string;
    image_explanation: string;
    similarity: number;
  }>;
  isLocationMatch: boolean;
  isPeopleMatch: boolean;
  isKeywordMatch: boolean;
}

/**
 * Calculate cosine similarity between two embeddings
 */
function calculateCosineSimilarity(embedding1: number[], embedding2: any): number {
  if (!embedding1 || !Array.isArray(embedding1) || embedding1.length === 0) {
    return 0;
  }

  if (!embedding2) {
    return 0;
  }

  let embedding2Array = embedding2;

  if (typeof embedding2 === 'string') {
    try {
      const cleanStr = embedding2.replace(/[\[\]]/g, '');
      embedding2Array = cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
    } catch (e) {
      console.error('Failed to parse embedding2 string:', e);
      return 0;
    }
  }

  if (!Array.isArray(embedding2Array) || embedding2Array.length === 0) {
    return 0;
  }

  if (embedding2Array.length !== embedding1.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < embedding1.length; i++) {
    const a = embedding1[i];
    const b = embedding2Array[i];
    
    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  const normA = Math.sqrt(magnitudeA);
  const normB = Math.sqrt(magnitudeB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (normA * normB);
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Calculate multi-keyword match score
 */
function calculateMultiKeywordMatch(
  keywordEmbeddings: number[][],
  targetEmbedding: any,
  threshold: number
): { matchCount: number; bestSimilarity: number } {
  let matchCount = 0;
  let bestSimilarity = 0;
  
  for (const keywordEmb of keywordEmbeddings) {
    const sim = calculateCosineSimilarity(keywordEmb, targetEmbedding);
    
    if (sim >= threshold) {
      matchCount++;
    }
    
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
    }
  }
  
  return { matchCount, bestSimilarity };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Extract entities (keywords, people, location) from query using OpenAI
 */
async function extractEntities(query: string, openaiApiKey: string): Promise<ExtractedEntities> {
  console.log('[Entity Extraction] Starting extraction for query:', query);
  
  const systemPrompt = `You are an AI assistant that extracts entities from a user's search query.
Identify and extract the following from the user's query:
- Keywords: Important terms for searching recall content (exclude verbs, proper nouns, names of people, venues, suburbs or locations)
- People: Names of individuals mentioned
- Location: Specific places or addresses
- LocationIntent: Type of location search ("in", "near", "near_me", or null)

Output the information as a JSON object with the following structure:
{
  "keywords": ["keyword1", "keyword2"],
  "people": ["person1", "person2"],
  "location": "specific location string",
  "locationIntent": "in"|"near"|"near_me"|null
}

Location intent rules:
- "in [location]" = within area (use "in")
- "near [location]" = near place (use "near")
- "near me" or "around me" = user location (use "near_me")
- No location mentioned = null

If a category is not found, use an empty array for keywords/people, empty string for location, and null for locationIntent.

Examples:
User: "recalls about John Doe in New York about his birthday party"
Output: {"keywords": ["birthday party"], "people": ["John Doe"], "location": "New York", "locationIntent": "in"}

User: "photos from last summer"
Output: {"keywords": ["photos", "last summer"], "people": [], "location": "", "locationIntent": null}

User: "restaurants near Collingwood"
Output: {"keywords": ["restaurants"], "people": [], "location": "Collingwood", "locationIntent": "near"}

User: "coffee shops near me"
Output: {"keywords": ["coffee shops"], "people": [], "location": "", "locationIntent": "near_me"}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 200
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Entity Extraction] OpenAI API error:', errorText);
    throw new Error(`Failed to extract entities: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.log('[Entity Extraction] No content returned');
    return { keywords: [], people: [], location: '', locationIntent: null };
  }

  const parsed = JSON.parse(content);
  const result: ExtractedEntities = {
    keywords: parsed.keywords || [],
    people: parsed.people || [],
    location: parsed.location || '',
    locationIntent: parsed.locationIntent || null
  };

  console.log('[Entity Extraction] Extracted entities:', result);
  return result;
}

/**
 * Generate embeddings for keywords using OpenAI
 */
async function generateKeywordEmbeddings(keywords: string[], openaiApiKey: string): Promise<number[][]> {
  if (keywords.length === 0) {
    return [];
  }

  console.log(`[Embeddings] Generating embeddings for ${keywords.length} keywords...`);
  
  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: keywords,
      encoding_format: 'base64'
    })
  });

  if (!embeddingResponse.ok) {
    const errorText = await embeddingResponse.text();
    console.error('[Embeddings] OpenAI embedding API error:', errorText);
    throw new Error(`Failed to generate embeddings: ${errorText}`);
  }

  const embeddingData = await embeddingResponse.json();
  
  if (!embeddingData.data || embeddingData.data.length === 0) {
    throw new Error('Invalid response from OpenAI API');
  }

  const embeddings: number[][] = embeddingData.data.map((item: any) => {
    const embeddingBase64 = item.embedding;
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    return Array.from(float32Array);
  });
  
  console.log(`[Embeddings] Successfully generated ${embeddings.length} embeddings`);
  return embeddings;
}

/**
 * Search for a place using Google Places API
 */
async function searchGooglePlaces(locationQuery: string, googleApiKey: string, userLocation?: { latitude: number; longitude: number }) {
  try {
    console.log('[Google Places] Searching for:', locationQuery);

    const baseUrl = 'https://places.googleapis.com/v1/places:searchText';

    const requestBody: any = {
      textQuery: locationQuery,
      languageCode: 'en',
      maxResultCount: 1,
    };

    if (userLocation) {
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
          radius: 50000.0,
        },
      };
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.places || data.places.length === 0) {
      return null;
    }

    const place = data.places[0];
    return {
      placeId: place.id,
      displayName: place.displayName?.text || 'Unknown Place',
      latitude: place.location?.latitude || 0,
      longitude: place.location?.longitude || 0,
    };
  } catch (error) {
    console.error('[Google Places] Error:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const startTime = Date.now();
  console.log('=== Search Recalls V3 Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('User authenticated:', user.id);

    const { query, userLocation } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Search query:', query);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!openaiApiKey || !googleApiKey) {
      return new Response(JSON.stringify({ error: 'API keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Extract all entities in a single OpenAI call
    const entityExtractionStart = Date.now();
    const entities = await extractEntities(query, openaiApiKey);
    const entityExtractionTime = Date.now() - entityExtractionStart;
    console.log(`[Timing] Entity extraction: ${entityExtractionTime}ms`);

    // Step 2: Generate embeddings for keywords (if any)
    const embeddingStart = Date.now();
    const keywordEmbeddings = await generateKeywordEmbeddings(entities.keywords, openaiApiKey);
    const embeddingTime = Date.now() - embeddingStart;
    console.log(`[Timing] Keyword embeddings: ${embeddingTime}ms`);

    // Step 3: Resolve location (if any)
    let locationCoords: { latitude: number; longitude: number; displayName: string; proximity: number } | null = null;
    const locationStart = Date.now();
    
    if (entities.location && entities.locationIntent) {
      if (entities.locationIntent === 'near_me' && userLocation) {
        locationCoords = {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          displayName: 'Your current location',
          proximity: 1
        };
      } else if (entities.location) {
        const placeResult = await searchGooglePlaces(entities.location, googleApiKey, userLocation);
        if (placeResult) {
          locationCoords = {
            latitude: placeResult.latitude,
            longitude: placeResult.longitude,
            displayName: placeResult.displayName,
            proximity: entities.locationIntent === 'in' ? 0.5 : 1
          };
        }
      }
    }
    
    const locationTime = Date.now() - locationStart;
    console.log(`[Timing] Location resolution: ${locationTime}ms`);

    // Step 4: Find matching people (if any)
    const peopleStart = Date.now();
    let matchingPersonIds: string[] = [];
    
    if (entities.people.length > 0) {
      const { data: personsData, error: personsError } = await supabase
        .from('persons')
        .select('id, person_name')
        .eq('user_id', user.id);

      if (!personsError && personsData) {
        for (const detectedName of entities.people) {
          const normalizedDetected = detectedName.toLowerCase().trim();
          for (const person of personsData) {
            const normalizedPerson = person.person_name.toLowerCase().trim();
            if (normalizedPerson === normalizedDetected) {
              matchingPersonIds.push(person.id);
            }
          }
        }
      }
    }
    
    const peopleTime = Date.now() - peopleStart;
    console.log(`[Timing] People matching: ${peopleTime}ms`);

    // Step 5: Single database query to fetch all recalls and images
    const dbQueryStart = Date.now();
    
    const [recallsResult, imagesResult, recallPeopleResult] = await Promise.all([
      supabase
        .from('recalls')
        .select('id, text, location, location_primary_type, recall_embedding, latitude, longitude, created_at')
        .eq('user_id', user.id)
        .not('recall_embedding', 'is', null),
      supabase
        .from('recall_images')
        .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
        .eq('user_id', user.id)
        .not('recall_image_embedding', 'is', null),
      matchingPersonIds.length > 0
        ? supabase
            .from('recall_people')
            .select('recall_id, person_id')
            .in('person_id', matchingPersonIds)
            .eq('user_id', user.id)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (recallsResult.error) {
      console.error('Error fetching recalls:', recallsResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (imagesResult.error) {
      console.error('Error fetching images:', imagesResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch images' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const allRecalls = recallsResult.data || [];
    const allImages = imagesResult.data || [];
    const recallPeopleData = recallPeopleResult.data || [];
    
    const dbQueryTime = Date.now() - dbQueryStart;
    console.log(`[Timing] Database query: ${dbQueryTime}ms`);
    console.log(`Found ${allRecalls.length} recalls and ${allImages.length} images`);

    // Step 6: Filter and score recalls
    const filteringStart = Date.now();
    
    // Group images by recall_id
    const imagesByRecall = new Map<string, typeof allImages>();
    for (const image of allImages) {
      if (!imagesByRecall.has(image.recall_id)) {
        imagesByRecall.set(image.recall_id, []);
      }
      imagesByRecall.get(image.recall_id)!.push(image);
    }

    // Group recall_people by recall_id
    const peopleByRecall = new Map<string, Set<string>>();
    for (const rp of recallPeopleData) {
      if (!peopleByRecall.has(rp.recall_id)) {
        peopleByRecall.set(rp.recall_id, new Set());
      }
      peopleByRecall.get(rp.recall_id)!.add(rp.person_id);
    }

    const recallMatches: RecallMatch[] = [];
    
    for (const recall of allRecalls) {
      let isLocationMatch = false;
      let isPeopleMatch = false;
      let isKeywordMatch = false;
      
      // Check location match
      if (locationCoords && recall.latitude && recall.longitude) {
        const distance = calculateDistance(
          locationCoords.latitude,
          locationCoords.longitude,
          recall.latitude,
          recall.longitude
        );
        isLocationMatch = distance <= locationCoords.proximity;
      }
      
      // Check people match
      if (matchingPersonIds.length > 0) {
        const recallPeople = peopleByRecall.get(recall.id);
        if (recallPeople) {
          for (const personId of matchingPersonIds) {
            if (recallPeople.has(personId)) {
              isPeopleMatch = true;
              break;
            }
          }
        }
      }
      
      // Check keyword match (if keywords exist)
      let textMatch = { matchCount: 0, bestSimilarity: 0 };
      let totalImageKeywordMatches = 0;
      const imageSimilarities: number[] = [];
      const imagesData: RecallMatch['images_data'] = [];
      
      if (keywordEmbeddings.length > 0) {
        textMatch = calculateMultiKeywordMatch(keywordEmbeddings, recall.recall_embedding, TEXT_SIMILARITY_THRESHOLD);
        
        const recallImages = imagesByRecall.get(recall.id) || [];
        for (const image of recallImages) {
          const imageMatch = calculateMultiKeywordMatch(keywordEmbeddings, image.recall_image_embedding, IMAGE_SIMILARITY_THRESHOLD);
          imageSimilarities.push(imageMatch.bestSimilarity);
          totalImageKeywordMatches += imageMatch.matchCount;
          
          imagesData.push({
            id: image.id,
            ocr_text: image.ocr_text || '',
            image_explanation: image.image_explanation || '',
            similarity: imageMatch.bestSimilarity
          });
        }
        
        isKeywordMatch = textMatch.bestSimilarity >= TEXT_SIMILARITY_THRESHOLD || 
                        imageSimilarities.some(sim => sim >= IMAGE_SIMILARITY_THRESHOLD);
      } else {
        // If no keywords, include all images
        const recallImages = imagesByRecall.get(recall.id) || [];
        for (const image of recallImages) {
          imagesData.push({
            id: image.id,
            ocr_text: image.ocr_text || '',
            image_explanation: image.image_explanation || '',
            similarity: 1.0
          });
        }
      }
      
      // Include recall if it matches any criteria
      if (isLocationMatch || isPeopleMatch || isKeywordMatch || 
          (entities.keywords.length === 0 && entities.people.length === 0 && !locationCoords)) {
        const totalKeywordMatches = textMatch.matchCount + totalImageKeywordMatches;
        
        recallMatches.push({
          recall_id: recall.id,
          text_similarity: textMatch.bestSimilarity,
          image_similarities: imageSimilarities,
          keyword_matches: totalKeywordMatches,
          recall_data: {
            text: recall.text || '',
            location: recall.location || '',
            location_primary_type: recall.location_primary_type || '',
            created_at: recall.created_at
          },
          images_data: imagesData,
          isLocationMatch,
          isPeopleMatch,
          isKeywordMatch
        });
      }
    }
    
    const filteringTime = Date.now() - filteringStart;
    console.log(`[Timing] Filtering and scoring: ${filteringTime}ms`);
    console.log(`Found ${recallMatches.length} matching recalls`);

    // Step 7: Sort recalls by match quality
    recallMatches.sort((a, b) => {
      const scoreA = (a.text_similarity * 100) + (a.isLocationMatch ? 50 : 0) + (a.isPeopleMatch ? 50 : 0);
      const scoreB = (b.text_similarity * 100) + (b.isLocationMatch ? 50 : 0) + (b.isPeopleMatch ? 50 : 0);
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      
      const dateA = new Date(a.recall_data.created_at).getTime();
      const dateB = new Date(b.recall_data.created_at).getTime();
      return dateB - dateA;
    });

    // Step 8: Generate answer using OpenAI (replicating search-recalls-v2 logic)
    const answerStart = Date.now();
    
    let answer = null;
    let confidence = 0;
    let sourcesUsed: string[] = [];
    
    if (recallMatches.length > 0) {
      const contextWithSources = recallMatches.map((recall, idx) => {
        const sourceId = `SOURCE_${idx + 1}`;
        
        const matchTypes: string[] = [];
        if (recall.isLocationMatch) matchTypes.push('LOCATION');
        if (recall.isPeopleMatch) matchTypes.push('PEOPLE');
        if (recall.isKeywordMatch) matchTypes.push('KEYWORD');
        const matchTypeStr = matchTypes.length > 0 ? ` [${matchTypes.join(' + ')}]` : '';
        
        const keywordMarker = recall.keyword_matches && entities.keywords.length > 0
          ? ` [${recall.keyword_matches}/${entities.keywords.length} keywords matched]` 
          : '';
        
        let contextText = `${sourceId} (${Math.round(recall.text_similarity * 100)}% match${matchTypeStr}${keywordMarker}):\n`;
        contextText += `Text: ${recall.recall_data.text}\n`;
        contextText += `Location: ${recall.recall_data.location}\n`;
        contextText += `Location Type: ${recall.recall_data.location_primary_type}\n`;
        
        if (recall.images_data && recall.images_data.length > 0) {
          contextText += `Images (${recall.images_data.length}):\n`;
          recall.images_data.forEach((img, imgIdx) => {
            contextText += `  Image ${imgIdx + 1}`;
            if (img.similarity && img.similarity < 1.0) {
              contextText += ` (${Math.round(img.similarity * 100)}% match)`;
            }
            contextText += `:\n`;
            if (img.image_explanation) {
              contextText += `    Explanation: ${img.image_explanation}\n`;
            }
            if (img.ocr_text) {
              contextText += `    OCR Text: ${img.ocr_text}\n`;
            }
          });
        }
        
        return {
          sourceId,
          recallId: recall.recall_id,
          text: contextText
        };
      });

      const context = contextWithSources.map(c => c.text).join('\n');

      const qaPrompt = `You are an intelligent search assistant that answers complex, composite questions based on the provided information. You understand the user's intent and make associations between pieces of information that the user would've expected to make. You also understand the context of the search query.

CRITICAL RULES:
- Prioritize your answer based on the recalls with the highest match percentages
- Use bullet points when listing multiple items
- Provide a confidence score (0-100) based on how well the recalls answer the question
- Research the answer thoroughly based on the provided information
- IMPORTANT: When referencing sources in your answer, use the format "SOURCE_X" (e.g., SOURCE_1, SOURCE_2) inline with the text
- Place source references immediately after the relevant information, like: "The restaurant is located in Collingwood SOURCE_1."
- You can reference the same source multiple times if needed
- Don't include explanatory text about sources - just use SOURCE_X inline

MATCH INFORMATION:
- Pay attention to match type indicators: [LOCATION], [PEOPLE], [KEYWORD]
- Pay attention to keyword match counts - more matched keywords indicate better relevance

Question: ${query}

Available Recalls (sorted by highest match percentage first):
${context}

Provide your answer in JSON format with inline source references: {"answer": "your comprehensive answer with SOURCE_X references inline", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}.
Example: {"answer": "The meeting is scheduled for next Tuesday SOURCE_1. John mentioned he'll bring the presentation SOURCE_2.", "confidence": 90, "sources": ["SOURCE_1", "SOURCE_2"]}
If the recalls don't contain the requested information, respond with: {"answer": "I don't have enough information in the provided recalls to answer this question.", "confidence": 0, "sources": []}.`;

      const qaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: qaPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 700,
          response_format: { type: 'json_object' }
        })
      });

      if (qaResponse.ok) {
        const qaData = await qaResponse.json();
        const qaContent = qaData.choices?.[0]?.message?.content;

        if (qaContent) {
          try {
            const parsed = JSON.parse(qaContent);
            answer = parsed.answer || null;
            confidence = parsed.confidence || 0;
            sourcesUsed = parsed.sources || [];
          } catch (parseError) {
            console.error('Failed to parse QA response:', parseError);
            answer = qaContent;
            confidence = 50;
          }
        }
      }

      const sourceRecallIds = sourcesUsed
        .map((sourceId: string) => {
          const source = contextWithSources.find(c => c.sourceId === sourceId);
          return source ? source.recallId : null;
        })
        .filter((id: string | null) => id !== null);

      const usedRecalls = recallMatches.filter(recall => sourceRecallIds.includes(recall.recall_id));
      const unusedRecalls = recallMatches.filter(recall => !sourceRecallIds.includes(recall.recall_id));
      
      usedRecalls.sort((a, b) => (b.text_similarity * 100) - (a.text_similarity * 100));
      unusedRecalls.sort((a, b) => (b.text_similarity * 100) - (a.text_similarity * 100));
      
      const orderedRecalls = [...usedRecalls, ...unusedRecalls];

      const matchResults = orderedRecalls.map(recall => ({
        id: recall.recall_id,
        matchPercentage: Math.round(recall.text_similarity * 100),
        usedForAnswer: sourceRecallIds.includes(recall.recall_id),
        keywordMatches: recall.keyword_matches || 0,
        totalKeywords: entities.keywords.length || 0,
        isLocationMatch: recall.isLocationMatch,
        isPeopleMatch: recall.isPeopleMatch,
        isKeywordMatch: recall.isKeywordMatch
      }));

      const answerTime = Date.now() - answerStart;
      console.log(`[Timing] Answer generation: ${answerTime}ms`);

      const processingTime = Date.now() - startTime;
      console.log('=== Search Recalls V3 completed successfully ===');
      console.log('Total processing time:', processingTime, 'ms');

      return new Response(JSON.stringify({
        answer,
        confidence,
        results: matchResults,
        processingTimeMs: processingTime,
        locationInfo: locationCoords ? {
          location: entities.location,
          resolvedPlace: locationCoords.displayName,
          proximity: locationCoords.proximity,
          intentType: entities.locationIntent,
          coordinates: {
            latitude: locationCoords.latitude,
            longitude: locationCoords.longitude
          }
        } : null,
        personInfo: entities.people.length > 0 ? {
          detectedNames: entities.people,
          matchedNames: entities.people
        } : null,
        extractedKeywords: entities.keywords,
        timings: {
          entityExtractionMs: entityExtractionTime,
          embeddingMs: embeddingTime,
          locationMs: locationTime,
          peopleMs: peopleTime,
          dbQueryMs: dbQueryTime,
          filteringMs: filteringTime,
          answerMs: answerTime,
          totalMs: processingTime
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // No matches found
    const processingTime = Date.now() - startTime;
    return new Response(JSON.stringify({
      answer: null,
      confidence: 0,
      results: [],
      processingTimeMs: processingTime,
      locationInfo: locationCoords ? {
        location: entities.location,
        resolvedPlace: locationCoords.displayName,
        proximity: locationCoords.proximity,
        intentType: entities.locationIntent,
        coordinates: {
          latitude: locationCoords.latitude,
          longitude: locationCoords.longitude
        }
      } : null,
      personInfo: entities.people.length > 0 ? {
        detectedNames: entities.people,
        matchedNames: entities.people
      } : null,
      extractedKeywords: entities.keywords,
      timings: {
        entityExtractionMs: entityExtractionTime,
        embeddingMs: embeddingTime,
        locationMs: locationTime,
        peopleMs: peopleTime,
        dbQueryMs: dbQueryTime,
        filteringMs: filteringTime,
        answerMs: 0,
        totalMs: processingTime
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Search Recalls V3 Edge Function ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Processing time before error:', processingTime, 'ms');

    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: processingTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
