import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Threshold configuration
const TEXT_SIMILARITY_THRESHOLD = 0.4;
const IMAGE_SIMILARITY_THRESHOLD = 0.25;
const URL_SIMILARITY_THRESHOLD = 0.4;

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
  url_similarities: number[];
  keyword_matches: number;
  recall_data: {
    text: string;
    location: string;
    location_primary_type: string;
    created_at: string;
    latitude: number | null;
    longitude: number | null;
  };
  images_data: Array<{
    id: string;
    ocr_text: string;
    image_explanation: string;
    similarity: number;
  }>;
  urls_data: Array<{
    id: string;
    url: string;
    og_site_name: string;
    og_title: string;
    og_description: string;
    url_data: string;
    similarity: number;
  }>;
  isLocationMatch: boolean;
  isPeopleMatch: boolean;
  isKeywordMatch: boolean;
  isUrlMatch: boolean;
}

/**
 * Generate a single query embedding from a search text using OpenAI
 */
async function generateQueryEmbedding(text: string, openaiApiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'base64'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate query embedding: ${errorText}`);
  }

  const data = await response.json();
  const embeddingBase64 = data.data?.[0]?.embedding;
  if (!embeddingBase64) throw new Error('No embedding returned');

  const binaryString = atob(embeddingBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const float32Array = new Float32Array(bytes.buffer);
  return Array.from(float32Array);
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
Output: {"keywords": ["coffee shops"], "people": [], "location": "", "locationIntent": "near_me"}

Respond with valid JSON only, no markdown.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ]
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

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch?.[0] ?? content);
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

    // Step 2: Generate single query embedding + location + people lookup in parallel
    const embeddingStart = Date.now();

    const resolveLocation = async (): Promise<{ latitude: number; longitude: number; displayName: string; proximity: number } | null> => {
      if (!entities.location || !entities.locationIntent) return null;
      if (entities.locationIntent === 'near_me' && userLocation) {
        return { latitude: userLocation.latitude, longitude: userLocation.longitude, displayName: 'Your current location', proximity: 1 };
      }
      if (entities.location) {
        const placeResult = await searchGooglePlaces(entities.location, googleApiKey, userLocation);
        if (placeResult) {
          return {
            latitude: placeResult.latitude,
            longitude: placeResult.longitude,
            displayName: placeResult.displayName,
            proximity: entities.locationIntent === 'in' ? 0.5 : 1
          };
        }
      }
      return null;
    };

    const resolvePersonIds = async (): Promise<{ ids: string[]; matchedNames: string[] }> => {
      if (entities.people.length === 0) return { ids: [], matchedNames: [] };
      const { data: personsData, error: personsError } = await supabase
        .from('persons')
        .select('id, person_name')
        .eq('user_id', user.id);
      if (personsError || !personsData) return { ids: [], matchedNames: [] };
      const ids: string[] = [];
      const matchedNames: string[] = [];
      for (const detectedName of entities.people) {
        const normalizedDetected = detectedName.toLowerCase().trim();
        for (const person of personsData) {
          if (person.person_name.toLowerCase().trim() === normalizedDetected) {
            ids.push(person.id);
            matchedNames.push(person.person_name);
          }
        }
      }
      return { ids, matchedNames };
    };

    // Build a rich search text combining query + extracted keywords for better embedding
    const searchText = entities.keywords.length > 0
      ? `${query} ${entities.keywords.join(' ')}`
      : query;

    const [queryEmbedding, locationCoords, { ids: matchingPersonIds, matchedNames: matchedPersonNames }] = await Promise.all([
      generateQueryEmbedding(searchText, openaiApiKey),
      resolveLocation(),
      resolvePersonIds()
    ]);

    const embeddingTime = Date.now() - embeddingStart;
    console.log(`[Timing] Query embedding + location + people (parallel): ${embeddingTime}ms`);

    // Step 3: Call pgvector RPC functions for similarity search in the database
    const dbQueryStart = Date.now();

    // Convert embedding array to pgvector string format
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const [recallsResult, imagesResult, urlsResult, recallPeopleResult] = await Promise.all([
      supabase.rpc('match_recalls', {
        query_embedding: embeddingStr,
        match_threshold: 0.4,
        match_count: 30,
        user_id_filter: user.id
      }),
      supabase.rpc('match_recall_images', {
        query_embedding: embeddingStr,
        match_threshold: 0.4,
        match_count: 30,
        user_id_filter: user.id
      }),
      supabase.rpc('match_recall_urls', {
        query_embedding: embeddingStr,
        match_threshold: 0.4,
        match_count: 30,
        user_id_filter: user.id
      }),
      matchingPersonIds.length > 0
        ? supabase
            .from('recall_people')
            .select('recall_id, person_id')
            .in('person_id', matchingPersonIds)
            .eq('user_id', user.id)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (recallsResult.error) {
      console.error('Error fetching recalls via RPC:', recallsResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (imagesResult.error) {
      console.error('Error fetching images via RPC:', imagesResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch images' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (urlsResult.error) {
      console.error('Error fetching urls via RPC:', urlsResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch urls' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const dbQueryTime = Date.now() - dbQueryStart;
    console.log(`[Timing] Database vector search (RPC): ${dbQueryTime}ms`);
    console.log(`Found ${(recallsResult.data || []).length} recall matches, ${(imagesResult.data || []).length} image matches, ${(urlsResult.data || []).length} url matches from DB`);

    // Step 4: Filter and score recalls
    const filteringStart = Date.now();

    const allRecalls = recallsResult.data || [];
    const allImages = imagesResult.data || [];
    const allUrls = urlsResult.data || [];
    const recallPeopleData = recallPeopleResult.data || [];

    // Group images by recall_id
    const imagesByRecall = new Map<string, typeof allImages>();
    for (const image of allImages) {
      if (!imagesByRecall.has(image.recall_id)) {
        imagesByRecall.set(image.recall_id, []);
      }
      imagesByRecall.get(image.recall_id)!.push(image);
    }

    // Group urls by recall_id
    const urlsByRecall = new Map<string, typeof allUrls>();
    for (const urlRow of allUrls) {
      if (!urlsByRecall.has(urlRow.recall_id)) {
        urlsByRecall.set(urlRow.recall_id, []);
      }
      urlsByRecall.get(urlRow.recall_id)!.push(urlRow);
    }

    // Also collect recall IDs that matched via images or urls (even if recall itself didn't hit threshold)
    const imageRecallIds = new Set<string>(allImages.map((img: any) => img.recall_id));
    const urlRecallIds = new Set<string>(allUrls.map((u: any) => u.recall_id));

    // Fetch full data for recalls that matched only via images or urls (not via text)
    const auxiliaryOnlyRecallIds = [...new Set([...imageRecallIds, ...urlRecallIds])].filter(
      id => !allRecalls.some((r: any) => r.id === id)
    );

    let auxiliaryOnlyRecalls: any[] = [];
    if (auxiliaryOnlyRecallIds.length > 0) {
      const { data } = await supabase
        .from('recalls')
        .select('id, text, location, location_primary_type, latitude, longitude, created_at')
        .in('id', auxiliaryOnlyRecallIds)
        .eq('user_id', user.id);
      auxiliaryOnlyRecalls = data || [];
    }

    // Combine all candidate recalls
    const allCandidates = [
      ...allRecalls.map((r: any) => ({ ...r, textSimilarity: 1 - (r.distance ?? 1) })),
      ...auxiliaryOnlyRecalls.map((r: any) => ({ ...r, textSimilarity: 0 }))
    ];

    // Group recall_people by recall_id
    const peopleByRecall = new Map<string, Set<string>>();
    for (const rp of recallPeopleData) {
      if (!peopleByRecall.has(rp.recall_id)) {
        peopleByRecall.set(rp.recall_id, new Set());
      }
      peopleByRecall.get(rp.recall_id)!.add(rp.person_id);
    }

    const recallMatches: RecallMatch[] = [];

    for (const recall of allCandidates) {
      let isLocationMatch = false;
      let isPeopleMatch = false;
      const isKeywordMatch = recall.textSimilarity >= TEXT_SIMILARITY_THRESHOLD;

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

      const recallImages = imagesByRecall.get(recall.id) || [];
      const imageSimilarities = recallImages.map((img: any) => 1 - (img.distance ?? 1));
      const imagesData: RecallMatch['images_data'] = recallImages.map((img: any) => ({
        id: img.id,
        ocr_text: img.ocr_text || '',
        image_explanation: img.image_explanation || '',
        similarity: 1 - (img.distance ?? 1)
      }));

      const recallUrls = urlsByRecall.get(recall.id) || [];
      const urlSimilarities = recallUrls.map((u: any) => 1 - (u.distance ?? 1));
      const urlsData: RecallMatch['urls_data'] = recallUrls.map((u: any) => ({
        id: u.id,
        url: u.url || '',
        og_site_name: u.og_site_name || '',
        og_title: u.og_title || '',
        og_description: u.og_description || '',
        url_data: u.url_data || '',
        similarity: 1 - (u.distance ?? 1)
      }));

      const hasImageMatch = imageSimilarities.some(sim => sim >= IMAGE_SIMILARITY_THRESHOLD);
      const hasUrlMatch = urlSimilarities.some(sim => sim >= URL_SIMILARITY_THRESHOLD);

      if (isLocationMatch || isPeopleMatch || isKeywordMatch || hasImageMatch || hasUrlMatch ||
          (entities.keywords.length === 0 && entities.people.length === 0 && !locationCoords)) {
        recallMatches.push({
          recall_id: recall.id,
          text_similarity: recall.textSimilarity,
          image_similarities: imageSimilarities,
          url_similarities: urlSimilarities,
          keyword_matches: isKeywordMatch? 1:0,
          recall_data: {
          text: recall.text||'',
          location: recall.location||'',
          location_primary_type: recall.location_primary_type||'',
          created_at: recall.created_at,
          latitude: recall.latitude??null,
          longitude: recall.longitude??null,
          },
          images_data: imagesData,
          urls_data: urlsData,
          isLocationMatch,
          isPeopleMatch,
          isKeywordMatch,
          isUrlMatch: false
          });
      }
    }

    const filteringTime = Date.now() - filteringStart;
    console.log(`[Timing] Filtering and scoring: ${filteringTime}ms`);
    console.log(`Found ${recallMatches.length} matching recalls`);

    // Step 5: Sort recalls by match quality
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

    // Step 6: Generate answer using OpenAI
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

        if (recall.urls_data && recall.urls_data.length > 0) {
          contextText += `URLs (${recall.urls_data.length}):\n`;
          recall.urls_data.forEach((url, urlIdx) => {
            contextText += `  URL ${urlIdx + 1}`;
            if (url.similarity && url.similarity < 1.0) {
              contextText += ` (${Math.round(url.similarity * 100)}% match)`;
            }
            contextText += `:\n`;
            if (url.og_title) {
              contextText += `    URL Title: ${url.og_title}\n`;
            }
            if (url.og_description) {
              contextText += `    URL Description: ${url.og_description}\n`;
            }
            if (url.url_data) {
              contextText += `    URL Data: ${url.url_data}\n`;
            }
            if (url.url) {
              contextText += `    URL: ${url.url}\n`;
            }
          });
        }

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

      const qaSystemPrompt = `You are an intelligent search assistant that answers complex, composite questions based on the provided information. You understand the user's intent and make associations between pieces of information that the user would've expected to make. You also understand the context of the search query.

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

Provide your answer in JSON format with inline source references: {"answer": "your comprehensive answer with SOURCE_X references inline", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}.
Example: {"answer": "The meeting is scheduled for next Tuesday SOURCE_1. John mentioned he'll bring the presentation SOURCE_2.", "confidence": 90, "sources": ["SOURCE_1", "SOURCE_2"]}
If the recalls don't contain the requested information, respond with: {"answer": "I don't have enough information in the provided recalls to answer this question.", "confidence": 0, "sources": []}.

Respond with valid JSON only, no markdown.`;

      const qaUserMessage = `Question: ${query}

Available Recalls (sorted by highest match percentage first):
${context}`;

      const qaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          max_tokens: 2048,
          messages: [
            { role: 'system', content: qaSystemPrompt },
            { role: 'user', content: qaUserMessage }
          ]
        })
      });

      if (qaResponse.ok) {
        const qaData = await qaResponse.json();
        const qaContent = qaData.choices?.[0]?.message?.content;

        if (qaContent) {
          try {
            const jsonMatch = qaContent.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch?.[0] ?? qaContent);
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
        latitude: recall.recall_data.latitude ?? null,
        longitude: recall.recall_data.longitude ?? null,
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
          matchedNames: matchedPersonNames
        } : null,
        extractedKeywords: entities.keywords,
        timings: {
          entityExtractionMs: entityExtractionTime,
          parallelSetupMs: embeddingTime,
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
        matchedNames: matchedPersonNames
      } : null,
      extractedKeywords: entities.keywords,
      timings: {
        entityExtractionMs: entityExtractionTime,
        parallelSetupMs: embeddingTime,
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
