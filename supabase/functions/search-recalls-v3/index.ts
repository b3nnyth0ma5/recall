import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Threshold configuration
const TEXT_SIMILARITY_THRESHOLD = 0.4;
const IMAGE_SIMILARITY_THRESHOLD = 0.4;
const URL_SIMILARITY_THRESHOLD = 0.4;
const DOCUMENT_SIMILARITY_THRESHOLD = 0.4;

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
  document_similarities: number[];
  isDocumentMatch?: boolean;
  documents_data: { id: string; file_name: string; content_type: string; cdn_url: string | null; thumbnail_url: string | null; page_count: number | null; extracted_text_preview: string | null; doc_explanation: string | null; }[];
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

Example:
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

    // Step 1: Parse all request fields including fast-mode fields
    const {
      query,
      userLocation,
      search_uploads,
      pre_extracted_entities,
      skip_answer,
      generate_answer_only,
      context_for_answer: clientContextForAnswer,
      uploaded_images_context: uploadedImagesContextParam
    } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Search query:', query);
    if (search_uploads && Array.isArray(search_uploads) && search_uploads.length > 0) {
      console.log(`Search includes ${search_uploads.length} uploaded image(s)`);
    }

    // Step 2: Retrieve and validate API keys (must happen before generate_answer_only check)
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!openaiApiKey || !googleApiKey) {
      return new Response(JSON.stringify({ error: 'API keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: generate_answer_only short-circuit — skip all vector search, stream QA answer token-by-token
    if (generate_answer_only && clientContextForAnswer) {
      console.log('[Answer Generation] Streaming answer via OpenAI (generate_answer_only path), context length:', clientContextForAnswer.length);

      const qaSystemPrompt = `You are an intelligent search assistant that answers questions based on the user's personal recall notes. You understand the user's intent and make associations between pieces of information.

CRITICAL RULES:
- Answer in plain prose — no JSON, no markdown code blocks
- Prioritize recalls with the highest match percentages
- Use bullet points when listing multiple items
- Don't include URLs in your answer
- When referencing sources, use the format SOURCE_X inline immediately after the relevant information
- Example: "The restaurant is located in Collingwood SOURCE_1. They serve Italian food SOURCE_1 SOURCE_2."
- You can reference the same source multiple times
- Don't add explanatory text about sources — just use SOURCE_X inline
- Be concise and direct

MATCH INFORMATION:
- Pay attention to match type indicators: [LOCATION], [PEOPLE], [KEYWORD]
- Higher match percentages indicate more relevant recalls

LINKED PAGES AND DOCUMENTS:
- Each recall may include "Linked pages" (content from URLs) or "Documents" (extracted text from files)
- Attribute information from these sources clearly

UPLOADED SEARCH IMAGES:
- The user may have attached images to their search (shown as "UPLOADED IMAGES CONTEXT")
- Use image descriptions and extracted text to understand what the user is looking for
- Cross-reference image content with recall data

If the recalls don't contain enough information to answer the question, say so plainly in one sentence.`;

      const uploadedCtx = uploadedImagesContextParam ?? '';
      const qaUserMessage = `Question: ${query}${uploadedCtx}\n\n${clientContextForAnswer}`;

      const qaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          max_tokens: 2048,
          stream: true,
          messages: [
            { role: 'system', content: qaSystemPrompt },
            { role: 'user', content: qaUserMessage }
          ]
        })
      });

      if (!qaResponse.ok) {
        const errText = await qaResponse.text();
        console.error('[Answer Generation] OpenAI streaming error:', errText);
        return new Response(JSON.stringify({
          answer: null,
          confidence: 0,
          sources: [],
          results: [],
          processingTimeMs: Date.now() - startTime
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Build a TransformStream that:
      // 1. Parses OpenAI SSE chunks and re-emits token strings as "data: <token>\n\n"
      // 2. Accumulates the full answer, then on flush emits a final DONE event with parsed JSON
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let fullAnswer = '';
      let leftover = '';

      const transformStream = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          const text = leftover + decoder.decode(chunk, { stream: true });
          const lines = text.split('\n');
          // Keep the last (potentially incomplete) line as leftover
          leftover = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              const token: string | undefined = parsed?.choices?.[0]?.delta?.content;
              if (token && token.length > 0) {
                fullAnswer += token;
                // Issue 1 fix: escape literal newlines so the SSE frame is never split
                controller.enqueue(encoder.encode(`data: ${token.replace(/\n/g, '\\n')}\n\n`));
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        },
        flush(controller) {
          // Process any remaining leftover
          if (leftover.trim().startsWith('data:')) {
            const payload = leftover.trim().slice(5).trim();
            if (payload !== '[DONE]') {
              try {
                const parsed = JSON.parse(payload);
                const token: string | undefined = parsed?.choices?.[0]?.delta?.content;
                if (token && token.length > 0) {
                  fullAnswer += token;
                  // Issue 1 fix: escape literal newlines in leftover token too
                  controller.enqueue(encoder.encode(`data: ${token.replace(/\n/g, '\\n')}\n\n`));
                }
              } catch {
                // Ignore
              }
            }
          }

          // Extract SOURCE_X references from plain prose answer
          const sourceMatches = [...new Set(fullAnswer.match(/SOURCE_\d+/g) ?? [])];
          const confidence = fullAnswer.length > 20 ? Math.min(95, 50 + sourceMatches.length * 15) : 0;

          // Issue 2 fix: replace literal newlines in the JSON payload so the SSE frame is never split
          const donePayload = JSON.stringify({ answer: fullAnswer, confidence, sources: sourceMatches });
          const safeDonePayload = donePayload.replace(/\n/g, '\\n');
          controller.enqueue(encoder.encode(`data: [DONE] ${safeDonePayload}\n\n`));
        }
      });

      const transformedStream = qaResponse.body!.pipeThrough(transformStream);

      return new Response(transformedStream, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        }
      });
    }

    // Step 4: Extract all entities — use on-device result if provided, otherwise call OpenAI
    const entityExtractionStart = Date.now();
    const isValidPreExtracted = (
      pre_extracted_entities &&
      Array.isArray(pre_extracted_entities.keywords) &&
      Array.isArray(pre_extracted_entities.people) &&
      typeof pre_extracted_entities.location === 'string'
    );
    let entities: ExtractedEntities;
    if (isValidPreExtracted) {
      entities = {
        keywords: pre_extracted_entities.keywords,
        people: pre_extracted_entities.people,
        location: pre_extracted_entities.location,
        locationIntent: pre_extracted_entities.locationIntent ?? null,
      };
      console.log('[Entity Extraction] Mode: on-device', entities);
    } else {
      entities = await extractEntities(query, openaiApiKey);
      console.log('[Entity Extraction] Mode: cloud', entities);
    }
    const entityExtractionTime = Date.now() - entityExtractionStart;
    console.log(`[Timing] Entity extraction: ${entityExtractionTime}ms`);

    // Step 5: Generate single query embedding + location + people lookup in parallel
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

    // resolvePersonIds with partial name matching
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
          const normalizedPerson = person.person_name.toLowerCase().trim();
          // Match if either name contains the other (handles "John" matching "John Smith")
          if (
            normalizedPerson === normalizedDetected ||
            normalizedPerson.includes(normalizedDetected) ||
            normalizedDetected.includes(normalizedPerson)
          ) {
            if (!ids.includes(person.id)) {
              ids.push(person.id);
              matchedNames.push(person.person_name);
            }
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

    // Step 6: Call pgvector RPC functions for similarity search in the database
    const dbQueryStart = Date.now();

    // Convert embedding array to pgvector string format
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const embeddingArray = queryEmbedding;
    const [recallsResult, imagesResult, urlsResult, docRes, recallPeopleResult] = await Promise.all([
      supabase.rpc('match_recalls', {
        query_embedding: embeddingStr,
        match_threshold: 0.6,
        match_count: 30,
        user_id_filter: user.id
      }),
      supabase.rpc('match_recall_images', {
        query_embedding: embeddingStr,
        match_threshold: 0.75,
        match_count: 50,
        user_id_filter: user.id
      }),
      supabase.rpc('match_recall_urls', {
        query_embedding: embeddingStr,
        match_threshold: 0.6,
        match_count: 75,
        user_id_filter: user.id
      }),
      supabase.rpc('match_recall_documents', {
        query_embedding: embeddingArray,
        match_threshold: DOCUMENT_SIMILARITY_THRESHOLD,
        match_count: 50,
        user_id: user.id,
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

    // Step 7: Filter and score recalls
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

    // Group documents by recall_id
    const allDocs = docRes.data || [];
    type DocMatch = { id: string; recall_id: string; file_name: string; content_type: string; cdn_url: string | null; thumbnail_url: string | null; page_count: number | null; extracted_text_preview: string | null; doc_explanation: string | null; similarity: number; distance?: number; };
    const documentsByRecallId = new Map<string, DocMatch[]>();
    for (const doc of allDocs) {
      const docWithSim: DocMatch = { ...doc, similarity: 1 - (doc.distance ?? 1) };
      if (!documentsByRecallId.has(doc.recall_id)) {
        documentsByRecallId.set(doc.recall_id, []);
      }
      documentsByRecallId.get(doc.recall_id)!.push(docWithSim);
    }

    // Also collect recall IDs that matched via images or urls (even if recall itself didn't hit threshold)
    const imageRecallIds = new Set<string>(allImages.map((img: any) => img.recall_id));
    const urlRecallIds = new Set<string>(allUrls.map((u: any) => u.recall_id));
    const docRecallIds = new Set<string>(allDocs.map((d: any) => d.recall_id));

    // Fetch full data for recalls that matched only via images, urls, or documents (not via text)
    const auxiliaryOnlyRecallIds = [...new Set([...imageRecallIds, ...urlRecallIds, ...docRecallIds])].filter(
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
      const hasDocumentMatch = (documentsByRecallId.get(recall.id)?.length ?? 0) > 0;

      if (isLocationMatch || isPeopleMatch || isKeywordMatch || hasImageMatch || hasUrlMatch || hasDocumentMatch ||
          (entities.keywords.length === 0 && entities.people.length === 0 && !locationCoords)) {
        recallMatches.push({
          recall_id: recall.id,
          text_similarity: recall.textSimilarity,
          image_similarities: imageSimilarities,
          url_similarities: urlSimilarities,
          keyword_matches: isKeywordMatch ? 1 : 0,
          recall_data: {
            text: recall.text || '',
            location: recall.location || '',
            location_primary_type: recall.location_primary_type || '',
            created_at: recall.created_at,
            latitude: recall.latitude ?? null,
            longitude: recall.longitude ?? null,
          },
          images_data: imagesData,
          urls_data: urlsData,
          documents_data: (documentsByRecallId.get(recall.id) ?? []).map(d => ({
            id: d.id,
            file_name: d.file_name,
            content_type: d.content_type,
            cdn_url: d.cdn_url,
            thumbnail_url: d.thumbnail_url,
            page_count: d.page_count,
            extracted_text_preview: d.extracted_text_preview,
            doc_explanation: d.doc_explanation,
          })),
          document_similarities: (documentsByRecallId.get(recall.id) ?? []).map(d => d.similarity),
          isDocumentMatch: hasDocumentMatch,
          isLocationMatch,
          isPeopleMatch,
          isKeywordMatch,
          isUrlMatch: hasUrlMatch
        });
      }
    }

    const filteringTime = Date.now() - filteringStart;
    console.log(`[Timing] Filtering and scoring: ${filteringTime}ms`);
    console.log(`Found ${recallMatches.length} matching recalls`);

    // Step 8: Sort recalls by match quality
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

    // Step 9: Build uploadedImagesContext before the recallMatches block
    let uploadedImagesContext = '';
    if (search_uploads && Array.isArray(search_uploads) && search_uploads.length > 0) {
      uploadedImagesContext = `\n\nUPLOADED IMAGES CONTEXT (from images the user attached to this search):\n`;
      search_uploads.forEach((upload: { text?: string; explanation?: string }, idx: number) => {
        uploadedImagesContext += `Image ${idx + 1}:\n`;
        if (upload.explanation) {
          uploadedImagesContext += `  Description: ${upload.explanation}\n`;
        }
        if (upload.text && upload.text !== 'No text detected.') {
          uploadedImagesContext += `  Text in image: ${upload.text}\n`;
        }
      });
      uploadedImagesContext += `\nUse the above image context to help answer the question. For example, if the user uploaded a photo of a product and asks "have I seen this before?", use the image description and text to search for matching recalls.`;
    }

    // Step 10: skip_answer early-exit — return top recalls as context for on-device answer generation
    if (skip_answer) {
      const topRecalls = recallMatches.slice(0, 8);

      // Build context string for on-device answer generation
      const contextForAnswer = topRecalls.map((recall, idx) => {
        const sourceId = `SOURCE_${idx + 1}`;
        const matchTypes: string[] = [];
        if (recall.isLocationMatch) matchTypes.push('LOCATION');
        if (recall.isPeopleMatch) matchTypes.push('PEOPLE');
        if (recall.isKeywordMatch) matchTypes.push('KEYWORD');
        const matchTypeStr = matchTypes.length > 0 ? ` [${matchTypes.join(' + ')}]` : '';

        let contextText = `${sourceId} (${Math.round(recall.text_similarity * 100)}% match${matchTypeStr}):\n`;
        contextText += `Text: ${recall.recall_data.text}\n`;
        if (recall.recall_data.location) contextText += `Location: ${recall.recall_data.location}\n`;

        if (recall.images_data && recall.images_data.length > 0) {
          recall.images_data.forEach((img, imgIdx) => {
            if (img.image_explanation) contextText += `Image ${imgIdx + 1} description: ${img.image_explanation}\n`;
            if (img.ocr_text) contextText += `Image ${imgIdx + 1} text: ${img.ocr_text}\n`;
          });
        }

        if (recall.urls_data && recall.urls_data.length > 0) {
          recall.urls_data.forEach((url) => {
            if (url.og_title) contextText += `Linked page: ${url.og_title}\n`;
            if (url.url_data) contextText += `Page content: ${url.url_data.slice(0, 400)}\n`;
          });
        }

        return contextText;
      }).join('\n---\n');

      // Cap at 12,000 chars to stay within on-device model limits
      const cappedContext = contextForAnswer.slice(0, 12_000);

      const matchResults = topRecalls.map((recall, idx) => ({
        id: recall.recall_id,
        sourceNumber: idx + 1,
        latitude: recall.recall_data.latitude ?? null,
        longitude: recall.recall_data.longitude ?? null,
        matchPercentage: Math.round(recall.text_similarity * 100),
        usedForAnswer: false,
        keywordMatches: recall.keyword_matches || 0,
        totalKeywords: entities.keywords.length || 0,
        isLocationMatch: recall.isLocationMatch,
        isPeopleMatch: recall.isPeopleMatch,
        isKeywordMatch: recall.isKeywordMatch,
      }));

      const processingTime = Date.now() - startTime;
      console.log(`[skip_answer] Returning ${topRecalls.length} recalls as context (${cappedContext.length} chars)`);

      return new Response(JSON.stringify({
        answer: null,
        confidence: 0,
        results: matchResults,
        context_for_answer: cappedContext,
        uploaded_images_context: uploadedImagesContext,
        processingTimeMs: processingTime,
        locationInfo: locationCoords ? {
          location: entities.location,
          resolvedPlace: locationCoords.displayName,
          proximity: locationCoords.proximity,
          intentType: entities.locationIntent,
          coordinates: { latitude: locationCoords.latitude, longitude: locationCoords.longitude }
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
    }

    // Step 11: Normal answer generation path
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

        if (recall.urls_data && recall.urls_data.length > 0) {
          contextText += `Linked pages (${recall.urls_data.length}):\n`;
          recall.urls_data.forEach((url, urlIdx) => {
            contextText += `  Page ${urlIdx + 1}`;
            if (url.similarity && url.similarity < 1.0) {
              contextText += ` (${Math.round(url.similarity * 100)}% match)`;
            }
            contextText += `:\n`;
            if (url.og_title) {
              contextText += `    Title: ${url.og_title}\n`;
            }
            if (url.og_description) {
              contextText += `    Description: ${url.og_description}\n`;
            }
            if (url.url_data) {
              const excerpt = url.url_data.length > 800 ? url.url_data.slice(0, 800) + '\u2026' : url.url_data;
              contextText += `    Content: ${excerpt}\n`;
            }
          });
        }

        const documentsContext = recall.documents_data && recall.documents_data.length > 0
          ? `\n\nDocuments (${recall.documents_data.length}):\n` + recall.documents_data.map((d, i) =>
              `  ${i + 1}. ${d.file_name} (${d.content_type}${d.page_count ? `, ${d.page_count} pages` : ''})${d.doc_explanation ? ` — ${d.doc_explanation}` : ''}\n     Excerpt: ${(d.extracted_text_preview || '').slice(0, 800)}`
            ).join('\n')
          : '';
        contextText += documentsContext;

        return {
          sourceId,
          recallId: recall.recall_id,
          text: contextText
        };
      });

      // Build sourceNumber lookup: recallId → sourceNumber (1-based index in contextWithSources)
      const recallSourceNumberMap = new Map<string, number>();
      contextWithSources.forEach((c, idx) => {
        recallSourceNumberMap.set(c.recallId, idx + 1);
      });

      const context = contextWithSources.map(c => c.text).join('\n');

      // Build contextForAnswer to include in response
      const contextForAnswer = `Available Recalls (sorted by highest match percentage first):\n${context}`;

      const qaSystemPrompt = `You are an intelligent search assistant that answers questions based on the user's personal recall notes. You understand the user's intent and make associations between pieces of information.

CRITICAL RULES:
- Answer in plain prose — no JSON, no markdown code blocks
- Prioritize recalls with the highest match percentages
- Use bullet points when listing multiple items
- Don't include URLs in your answer
- When referencing sources, use the format SOURCE_X inline immediately after the relevant information
- Example: "The restaurant is located in Collingwood SOURCE_1. They serve Italian food SOURCE_1 SOURCE_2."
- You can reference the same source multiple times
- Don't add explanatory text about sources — just use SOURCE_X inline
- Be concise and direct

MATCH INFORMATION:
- Pay attention to match type indicators: [LOCATION], [PEOPLE], [KEYWORD]
- Higher match percentages indicate more relevant recalls

LINKED PAGES AND DOCUMENTS:
- Each recall may include "Linked pages" (content from URLs) or "Documents" (extracted text from files)
- Attribute information from these sources clearly

UPLOADED SEARCH IMAGES:
- The user may have attached images to their search (shown as "UPLOADED IMAGES CONTEXT")
- Use image descriptions and extracted text to understand what the user is looking for
- Cross-reference image content with recall data

If the recalls don't contain enough information to answer the question, say so plainly in one sentence.`;

      const qaUserMessage = `Question: ${query}${uploadedImagesContext}\n\nAvailable Recalls (sorted by highest match percentage first):\n${context}`;

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
          // Plain prose answer — extract SOURCE_X references to derive sources and confidence
          answer = qaContent;
          const sourceMatches = [...new Set(qaContent.match(/SOURCE_\d+/g) ?? [])];
          sourcesUsed = sourceMatches;
          confidence = qaContent.length > 20 ? Math.min(95, 50 + sourceMatches.length * 15) : 0;
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
        sourceNumber: recallSourceNumberMap.get(recall.recall_id) ?? null,
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
        context_for_answer: contextForAnswer.slice(0, 12_000),
        uploaded_images_context: uploadedImagesContext,
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
      context_for_answer: '',
      uploaded_images_context: uploadedImagesContext,
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