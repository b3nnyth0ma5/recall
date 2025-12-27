
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/**
 * Clean the word "recalls" from the search query
 */
function cleanRecallsFromQuery(query: string): string {
  // Remove "recalls" (case-insensitive) from the query
  // Handle variations: "recall", "recalls", "Recall", "Recalls", etc.
  const cleaned = query
    .replace(/\brecalls?\b/gi, '') // Remove "recall" or "recalls" as whole words
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim(); // Trim leading/trailing spaces
  
  console.log(`Cleaned query: "${query}" -> "${cleaned}"`);
  return cleaned;
}

/**
 * Clean people names from the search query
 */
function cleanPeopleNamesFromQuery(query: string, personInfo: any): string {
  if (!personInfo || !personInfo.matchedNames || personInfo.matchedNames.length === 0) {
    return query;
  }

  let cleaned = query;
  
  // Remove each matched person name from the query (case-insensitive)
  personInfo.matchedNames.forEach((name: string) => {
    // Escape special regex characters in the name
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Create regex to match the name as a whole word (case-insensitive)
    const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'gi');
    cleaned = cleaned.replace(nameRegex, '');
  });
  
  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  console.log(`Cleaned people names from query: "${query}" -> "${cleaned}"`);
  return cleaned;
}

/**
 * Decode base64 embedding to float array
 * 
 * OpenAI returns embeddings in base64 format when encoding_format='base64' is specified.
 * The base64 string represents a binary buffer of Float32 values.
 * This function decodes the base64 string back to a Float32Array, then converts to a regular array.
 * 
 * @param base64String - Base64 encoded string from OpenAI embeddings API
 * @returns Array of numbers representing the embedding vector
 */
function decodeBase64Embedding(base64String: string): number[] {
  try {
    // Decode base64 to binary string
    const binaryString = atob(base64String);
    
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Interpret bytes as Float32Array (4 bytes per float)
    const float32Array = new Float32Array(bytes.buffer);
    
    // Convert to regular array for easier manipulation
    return Array.from(float32Array);
  } catch (error) {
    console.error('Error decoding base64 embedding:', error);
    return [];
  }
}

/**
 * Calculate cosine similarity between two vectors
 * 
 * Cosine similarity measures the cosine of the angle between two vectors.
 * Returns a value between -1 and 1, where:
 * - 1 means vectors point in the same direction (identical)
 * - 0 means vectors are orthogonal (unrelated)
 * - -1 means vectors point in opposite directions
 * 
 * @param vec1 - First embedding vector
 * @param vec2 - Second embedding vector
 * @returns Cosine similarity score between -1 and 1
 */
function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  // Validate inputs
  if (!Array.isArray(vec1) || !Array.isArray(vec2)) return 0;
  if (vec1.length === 0 || vec2.length === 0) return 0;
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Calculate dot product and norms
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    normA += vec1[i] * vec1[i];
    normB += vec2[i] * vec2[i];
  }

  // Calculate cosine similarity
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  const similarity = dotProduct / denominator;
  
  // Clamp to [-1, 1] range to handle floating point errors
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Parse embedding from database (handles vector type and string formats)
 * 
 * Supabase stores embeddings as the 'vector' type in PostgreSQL.
 * When retrieved via the JS client, they come back as arrays of numbers.
 * This function handles various formats for robustness.
 * 
 * @param embedding - Embedding data from database (can be array, string, or null)
 * @returns Array of numbers representing the embedding vector
 */
function parseEmbedding(embedding: any): number[] {
  if (!embedding) return [];
  
  // If it's already an array, return it
  if (Array.isArray(embedding)) {
    return embedding;
  }
  
  // If it's a string, try to parse it
  if (typeof embedding === 'string') {
    try {
      // Remove brackets and parse as comma-separated floats
      const cleanStr = embedding.replace(/[\[\]]/g, '');
      return cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
    } catch (e) {
      console.error('Failed to parse embedding string:', e);
      return [];
    }
  }
  
  return [];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const startTime = Date.now();
  console.log('=== Search Recalls V2 Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const { query, locationRecallIds, peopleRecallIds, personInfo } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Original search query:', query);
    console.log('Location-filtered recall IDs:', locationRecallIds ? `${locationRecallIds.length} IDs` : 'None');
    console.log('People-filtered recall IDs:', peopleRecallIds ? `${peopleRecallIds.length} IDs` : 'None');
    console.log('Person info:', personInfo);

    // Clean people names from the query first
    let cleanedQuery = cleanPeopleNamesFromQuery(query, personInfo);
    console.log('After cleaning people names:', cleanedQuery);
    
    // Then clean the word "recalls" from the query
    cleanedQuery = cleanRecallsFromQuery(cleanedQuery);
    console.log('After cleaning "recalls":', cleanedQuery);

    // Combine location and people recall IDs (prioritize these)
    const priorityRecallIds = new Set<string>();
    if (locationRecallIds && Array.isArray(locationRecallIds)) {
      locationRecallIds.forEach((id: string) => priorityRecallIds.add(id));
    }
    if (peopleRecallIds && Array.isArray(peopleRecallIds)) {
      peopleRecallIds.forEach((id: string) => priorityRecallIds.add(id));
    }

    console.log(`Combined priority recall IDs: ${priorityRecallIds.size}`);

    // If query is blank after cleaning and we have priority recalls, return them all
    if (!cleanedQuery.trim() && priorityRecallIds.size > 0) {
      console.log('Query is blank after cleaning - returning all location/people results');
      
      const priorityIds = Array.from(priorityRecallIds);
      const { data: recallsData, error: fetchError } = await supabase
        .from('recalls')
        .select('id')
        .in('id', priorityIds)
        .eq('user_id', user.id);

      if (fetchError) {
        console.error('Error fetching priority recalls:', fetchError);
        return new Response(JSON.stringify({ error: 'Failed to fetch recalls', details: fetchError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const results = (recallsData || []).map((recall: any) => ({
        id: recall.id,
        matchPercentage: 100, // All priority recalls get 100% match
        usedForAnswer: false,
      }));

      console.log(`Returning ${results.length} priority recalls (query was blank after cleaning)`);

      return new Response(JSON.stringify({
        answer: null,
        confidence: 0,
        results,
        processingTimeMs: Date.now() - startTime,
        personInfo: personInfo || null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // If query is blank and no priority recalls, return empty results
    if (!cleanedQuery.trim()) {
      console.log('Query is blank after cleaning and no priority recalls - returning empty results');
      return new Response(JSON.stringify({
        answer: null,
        confidence: 0,
        results: [],
        processingTimeMs: Date.now() - startTime,
        personInfo: personInfo || null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Use OpenAI NER to extract keywords from the query
    console.log('Step 1: Extracting keywords using OpenAI NER...');
    const nerPrompt = `Extract key search terms from: "${cleanedQuery}"\nReturn only comma-separated keywords (entities, nouns, verbs, concepts).`;

    const nerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Extract keywords from queries. Return comma-separated list only.'
          },
          {
            role: 'user',
            content: nerPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      })
    });

    if (!nerResponse.ok) {
      const errorText = await nerResponse.text();
      console.error('OpenAI NER API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to extract keywords', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const nerData = await nerResponse.json();
    const extractedKeywords = nerData.choices?.[0]?.message?.content?.trim() || cleanedQuery;
    console.log('Extracted keywords:', extractedKeywords);

    // Step 1b: Convert extracted keywords to embedding using OpenAI
    // IMPORTANT: We use base64 encoding format for efficient transmission
    // The base64 string will be decoded to a float array for comparison
    console.log('Step 1b: Converting extracted keywords to embedding...');
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: extractedKeywords,
        encoding_format: 'base64' // Request base64 encoding for efficient transmission
      })
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('OpenAI embedding API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to generate embedding', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const embeddingData = await embeddingResponse.json();
    const embeddingBase64 = embeddingData.data[0].embedding;
    console.log('Embedding generated successfully (base64 format)');
    console.log('Base64 embedding length:', embeddingBase64.length, 'characters');

    // Decode base64 to get the actual embedding array
    // This converts the base64 string to a Float32Array, then to a regular array
    const queryEmbedding = decodeBase64Embedding(embeddingBase64);
    console.log('Decoded query embedding array length:', queryEmbedding.length, 'dimensions');

    if (queryEmbedding.length === 0) {
      console.error('Failed to decode query embedding');
      return new Response(JSON.stringify({ error: 'Failed to decode query embedding' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 2: Find closest matches using vector similarity (>= 40% threshold)
    console.log('Step 2: Finding closest matches with >= 40% similarity...');

    // Build query for images
    let imagesQuery = supabase
      .from('recall_images')
      // COMMENTED OUT: ocr_text usage - uncomment if needed
      // .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
      .select('id, recall_id, image_explanation, recall_image_embedding')
      .eq('user_id', user.id)
      .not('recall_image_embedding', 'is', null);

    // Build query for recalls
    let recallsQuery = supabase
      .from('recalls')
      .select('id, text, location, location_primary_type, recall_embedding')
      .eq('user_id', user.id)
      .not('recall_embedding', 'is', null);

    // If priority recall IDs exist, filter to those first
    if (priorityRecallIds.size > 0) {
      const priorityIds = Array.from(priorityRecallIds);
      console.log(`Filtering to ${priorityIds.length} priority recalls`);
      imagesQuery = imagesQuery.in('recall_id', priorityIds);
      recallsQuery = recallsQuery.in('id', priorityIds);
    }

    // Fetch images with embeddings
    const { data: allImages, error: fetchImagesError } = await imagesQuery;
    if (fetchImagesError) {
      console.error('Error fetching images:', fetchImagesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch images', details: fetchImagesError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`Found ${allImages?.length || 0} images with embeddings`);

    // Fetch recalls with embeddings
    const { data: allRecalls, error: fetchRecallsError } = await recallsQuery;
    if (fetchRecallsError) {
      console.error('Error fetching recalls:', fetchRecallsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls', details: fetchRecallsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`Found ${allRecalls?.length || 0} recalls with embeddings`);

    // Calculate cosine similarity for each image
    // NOTE: Embeddings stored in database are already in float array format (vector type)
    // We parse them to ensure they're in the correct format, then compare with query embedding
    const imageMatches = (allImages || []).map((image: any) => {
      const storedEmbedding = parseEmbedding(image.recall_image_embedding);
      const similarity = calculateCosineSimilarity(queryEmbedding, storedEmbedding);
      const isPriority = priorityRecallIds.has(image.recall_id);
      
      return {
        id: image.id,
        recall_id: image.recall_id,
        // COMMENTED OUT: ocr_text usage - uncomment if needed
        // ocr_text: image.ocr_text || '',
        image_explanation: image.image_explanation || '',
        similarity,
        source: 'image',
        isPriority
      };
    });

    // Calculate cosine similarity for each recall
    const recallMatches = (allRecalls || []).map((recall: any) => {
      const storedEmbedding = parseEmbedding(recall.recall_embedding);
      const similarity = calculateCosineSimilarity(queryEmbedding, storedEmbedding);
      const isPriority = priorityRecallIds.has(recall.id);
      
      return {
        id: recall.id,
        recall_id: recall.id,
        text: recall.text || '',
        location: recall.location || '',
        location_primary_type: recall.location_primary_type || '',
        similarity,
        source: 'recall',
        isPriority
      };
    });

    // Combine all matches
    const allMatches = [...imageMatches, ...recallMatches];
    console.log(`Total matches before filtering: ${allMatches.length}`);

    // IMPROVED SEARCH LOGIC: Multi-tier similarity thresholds
    // Tier 1: High confidence matches (>= 60%)
    // Tier 2: Medium confidence matches (>= 40%)
    // Tier 3: Low confidence matches (>= 25%) - only if priority recalls
    const HIGH_THRESHOLD = 0.60;
    const MEDIUM_THRESHOLD = 0.40;
    const LOW_THRESHOLD = 0.25;

    const filteredMatches = allMatches.filter((match: any) => {
      // Always include high and medium confidence matches
      if (match.similarity >= MEDIUM_THRESHOLD) return true;
      // Include low confidence matches only if they're priority recalls
      if (match.similarity >= LOW_THRESHOLD && match.isPriority) return true;
      return false;
    });

    console.log(`Filtered matches: ${filteredMatches.length} (from ${allMatches.length} total)`);

    // Sort by priority first, then similarity
    // This ensures priority recalls appear first, followed by best matches
    filteredMatches.sort((a: any, b: any) => {
      // Prioritize priority recalls
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      // Then sort by similarity (highest first)
      return b.similarity - a.similarity;
    });

    console.log(`Found ${filteredMatches.length} matches after filtering and sorting`);

    // Group matches by recall_id and keep the highest similarity for each recall
    // This prevents duplicate recalls in results (e.g., if multiple images match)
    const recallMatchMap = new Map();
    for (const match of filteredMatches) {
      const existing = recallMatchMap.get(match.recall_id);
      if (!existing || match.similarity > existing.similarity) {
        recallMatchMap.set(match.recall_id, match);
      }
    }

    // Convert back to array and sort by priority + similarity
    let uniqueRecallMatches = Array.from(recallMatchMap.values()).sort((a: any, b: any) => {
      // Prioritize priority recalls
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      // Then sort by similarity
      return b.similarity - a.similarity;
    });
    console.log(`Grouped into ${uniqueRecallMatches.length} unique recalls`);

    if (uniqueRecallMatches.length === 0) {
      console.log('No matches found');
      return new Response(JSON.stringify({
        answer: null,
        confidence: 0,
        results: [],
        processingTimeMs: Date.now() - startTime,
        personInfo: personInfo || null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: Use OpenAI gpt-4o-mini for question answering with source tracking
    console.log('Step 3: Using OpenAI gpt-4o-mini for question answering with source tracking...');

    // Prepare context from matches with source IDs
    const contextWithSources = uniqueRecallMatches.map((match: any, idx: number) => {
      const sourceId = `SOURCE_${idx + 1}`;
      const priorityMarker = match.isPriority ? ' [PRIORITY]' : '';
      const matchPercent = Math.round(match.similarity * 100);

      if (match.source === 'image') {
        return {
          sourceId,
          recallId: match.recall_id,
          // COMMENTED OUT: ocr_text usage - uncomment if needed
          // text: `${sourceId} (${matchPercent}% match${priorityMarker}):\nOCR: ${match.ocr_text}\nImage: ${match.image_explanation}`,
          text: `${sourceId} (${matchPercent}% match${priorityMarker}):\nImage: ${match.image_explanation}`,
          similarity: match.similarity,
          isPriority: match.isPriority
        };
      } else {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${matchPercent}% match${priorityMarker}):\nText: ${match.text}\nLocation: ${match.location}`,
          similarity: match.similarity,
          isPriority: match.isPriority
        };
      }
    });

    const context = contextWithSources.map((c: any) => c.text).join('\n\n');

    // OPTIMIZED PROMPT: More concise and efficient
    const qaPrompt = `You are an insightful search assistant. Answer based on provided information. If info missing, say so.\n\nQuestion: ${cleanedQuery}\n\nRecalls:\n${context}\n\nJSON format: {"answer": "your answer", "confidence": 0-100, "sources": ["SOURCE_1"]}\nPrioritize [PRIORITY] sources and higher match %.`;

    console.log('Making request to OpenAI gpt-4o-mini...');
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
            role: 'system',
            content: 'Answer questions using provided data. Be accurate. Return JSON.'
          },
          {
            role: 'user',
            content: qaPrompt
          }
        ],
        temperature: 0.35,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      })
    });

    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('OpenAI QA API error:', errorText);
      console.error('Response status:', qaResponse.status);
      return new Response(JSON.stringify({ error: 'Failed to generate answer', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qaData = await qaResponse.json();
    console.log('OpenAI response received');
    const qaContent = qaData.choices?.[0]?.message?.content;

    let answer = null;
    let confidence = 0;
    let sourcesUsed: string[] = [];

    if (qaContent) {
      try {
        const parsed = JSON.parse(qaContent);
        answer = parsed.answer || null;
        confidence = parsed.confidence || 0;
        sourcesUsed = parsed.sources || [];
        console.log('Sources used by AI:', sourcesUsed);
      } catch (parseError) {
        console.error('Failed to parse QA response:', parseError);
        console.error('Raw content:', qaContent);
        // Fallback: use the raw content as answer
        answer = qaContent;
        confidence = 50;
      }
    }

    console.log('Answer generated:', answer ? 'Yes' : 'No');
    console.log('Confidence:', confidence);

    // Map source IDs back to recall IDs
    const sourceRecallIds = sourcesUsed
      .map((sourceId: string) => {
        const source = contextWithSources.find((c: any) => c.sourceId === sourceId);
        return source ? source.recallId : null;
      })
      .filter((id: string | null) => id !== null);

    console.log('Recall IDs used for answer:', sourceRecallIds);

    // Create results with proper ordering (priority first, then used for answer, then others)
    const usedRecalls = uniqueRecallMatches
      .filter((match: any) => sourceRecallIds.includes(match.recall_id))
      .sort((a: any, b: any) => {
        // Prioritize priority recalls
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        // Then sort by similarity
        return b.similarity - a.similarity;
      });

    const unusedRecalls = uniqueRecallMatches
      .filter((match: any) => !sourceRecallIds.includes(match.recall_id))
      .sort((a: any, b: any) => {
        // Prioritize priority recalls
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        // Then sort by similarity
        return b.similarity - a.similarity;
      });

    const orderedMatches = [...usedRecalls, ...unusedRecalls];

    console.log(`Ordered results: ${usedRecalls.length} used for answer, ${unusedRecalls.length} others`);

    // Convert similarity to match percentage (0-100)
    const matchResults = orderedMatches.map((match: any) => ({
      id: match.recall_id,
      matchPercentage: Math.round(Math.max(0, Math.min(100, match.similarity * 100))),
      usedForAnswer: sourceRecallIds.includes(match.recall_id)
    }));

    const processingTime = Date.now() - startTime;
    console.log('=== Search Recalls V2 completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    // Return results with recall_id and person info
    return new Response(JSON.stringify({
      answer,
      confidence,
      results: matchResults,
      processingTimeMs: processingTime,
      personInfo: personInfo || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Search Recalls V2 Edge Function ===');
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
