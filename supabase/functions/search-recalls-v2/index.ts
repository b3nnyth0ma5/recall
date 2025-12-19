
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function cleanRecallsFromQuery(query: string): string {
  const cleaned = query
    .replace(/\brecalls?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log(`Cleaned query: "${query}" -> "${cleaned}"`);
  return cleaned;
}

function cleanPeopleNamesFromQuery(query: string, personInfo: any): string {
  if (!personInfo || !personInfo.matchedNames || personInfo.matchedNames.length === 0) {
    return query;
  }

  let cleaned = query;
  
  personInfo.matchedNames.forEach((name: string) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'gi');
    cleaned = cleaned.replace(nameRegex, '');
  });
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  console.log(`Cleaned people names from query: "${query}" -> "${cleaned}"`);
  return cleaned;
}

Deno.serve(async (req) => {
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

    console.log('Authenticated user:', user.id);

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

    let cleanedQuery = cleanPeopleNamesFromQuery(query, personInfo);
    console.log('After cleaning people names:', cleanedQuery);
    
    cleanedQuery = cleanRecallsFromQuery(cleanedQuery);
    console.log('After cleaning "recalls":', cleanedQuery);

    const priorityRecallIds = new Set<string>();
    if (locationRecallIds && Array.isArray(locationRecallIds)) {
      locationRecallIds.forEach((id: string) => priorityRecallIds.add(id));
    }
    if (peopleRecallIds && Array.isArray(peopleRecallIds)) {
      peopleRecallIds.forEach((id: string) => priorityRecallIds.add(id));
    }

    console.log(`Combined priority recall IDs: ${priorityRecallIds.size}`);

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
        matchPercentage: 100,
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

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Step 1: Converting cleaned query to embedding...');
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: cleanedQuery,
        encoding_format: 'base64'
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
    console.log('Embedding generated successfully');

    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    const queryEmbedding = Array.from(float32Array);

    console.log('Decoded query embedding array length:', queryEmbedding.length);

    console.log('Step 2: Finding closest matches with >= 40% similarity...');

    let imagesQuery = supabase
      .from('recall_images')
      .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
      .eq('user_id', user.id)
      .not('recall_image_embedding', 'is', null);

    let recallsQuery = supabase
      .from('recalls')
      .select('id, text, location, location_primary_type, recall_embedding')
      .eq('user_id', user.id)
      .not('recall_embedding', 'is', null);

    if (priorityRecallIds.size > 0) {
      const priorityIds = Array.from(priorityRecallIds);
      console.log(`Filtering to ${priorityIds.length} priority recalls`);
      imagesQuery = imagesQuery.in('recall_id', priorityIds);
      recallsQuery = recallsQuery.in('id', priorityIds);
    }

    const { data: allImages, error: fetchImagesError } = await imagesQuery;
    if (fetchImagesError) {
      console.error('Error fetching images:', fetchImagesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch images', details: fetchImagesError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`Found ${allImages?.length || 0} images with embeddings`);

    const { data: allRecalls, error: fetchRecallsError } = await recallsQuery;
    if (fetchRecallsError) {
      console.error('Error fetching recalls:', fetchRecallsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls', details: fetchRecallsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`Found ${allRecalls?.length || 0} recalls with embeddings`);

    const calculateCosineSimilarity = (storedEmbedding: any) => {
      if (!storedEmbedding) return 0;

      let storedEmbeddingArray = storedEmbedding;

      if (typeof storedEmbedding === 'string') {
        try {
          const cleanStr = storedEmbedding.replace(/[\[\]]/g, '');
          storedEmbeddingArray = cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
        } catch (e) {
          console.error('Failed to parse embedding string:', e);
          return 0;
        }
      }

      if (!Array.isArray(storedEmbeddingArray) || storedEmbeddingArray.length === 0) return 0;
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return 0;
      if (storedEmbeddingArray.length !== queryEmbedding.length) return 0;

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < queryEmbedding.length; i++) {
        const queryVal = queryEmbedding[i];
        const storedVal = storedEmbeddingArray[i];
        dotProduct += queryVal * storedVal;
        normA += queryVal * queryVal;
        normB += storedVal * storedVal;
      }

      const denominator = Math.sqrt(normA) * Math.sqrt(normB);
      if (denominator === 0) return 0;

      const similarity = dotProduct / denominator;
      const clampedSimilarity = Math.max(-1, Math.min(1, similarity));

      return isNaN(clampedSimilarity) ? 0 : clampedSimilarity;
    };

    const imageMatches = (allImages || []).map((image: any) => {
      const similarity = calculateCosineSimilarity(image.recall_image_embedding);
      const isPriority = priorityRecallIds.has(image.recall_id);
      return {
        id: image.id,
        recall_id: image.recall_id,
        ocr_text: image.ocr_text || '',
        image_explanation: image.image_explanation || '',
        similarity,
        source: 'image',
        isPriority
      };
    });

    const recallMatches = (allRecalls || []).map((recall: any) => {
      const similarity = calculateCosineSimilarity(recall.recall_embedding);
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

    const allMatches = [...imageMatches, ...recallMatches];

    const SIMILARITY_THRESHOLD = 0.40;
    const filteredMatches = allMatches.filter((match: any) => match.similarity >= SIMILARITY_THRESHOLD);

    filteredMatches.sort((a: any, b: any) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      return b.similarity - a.similarity;
    });

    console.log(`Found ${filteredMatches.length} matches with >= 40% similarity`);

    const recallMatchMap = new Map();
    for (const match of filteredMatches) {
      const existing = recallMatchMap.get(match.recall_id);
      if (!existing || match.similarity > existing.similarity) {
        recallMatchMap.set(match.recall_id, match);
      }
    }

    let uniqueRecallMatches = Array.from(recallMatchMap.values()).sort((a: any, b: any) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
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

    console.log('Step 3: Using OpenAI gpt-4o-mini for question answering with source tracking...');

    const contextWithSources = uniqueRecallMatches.map((match: any, idx: number) => {
      const sourceId = `SOURCE_${idx + 1}`;
      const priorityMarker = match.isPriority ? ' [PRIORITY - From location/people search]' : '';

      if (match.source === 'image') {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from image${priorityMarker}):\nOCR Text: ${match.ocr_text}\nImage Explanation: ${match.image_explanation}`,
          similarity: match.similarity,
          isPriority: match.isPriority
        };
      } else {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from recall${priorityMarker}):\nText: ${match.text}\nLocation: ${match.location}\nLocation Type: ${match.location_primary_type}`,
          similarity: match.similarity,
          isPriority: match.isPriority
        };
      }
    });

    const context = contextWithSources.map((c: any) => c.text).join('\n\n');

    const qaPrompt = `You are a precise search assistant that answers questions based ONLY on the provided recall information.

CRITICAL RULES:
1. Answer ONLY using information explicitly stated in the provided recalls
2. Do NOT add information, assumptions, or general knowledge not present in the recalls
3. If the recalls don't contain enough information to answer the question, say so clearly
4. Use bullet points when listing multiple items
5. Provide a confidence score (0-100) based on how well the recalls answer the question

PRIORITY HANDLING:
- Sources marked as [PRIORITY - From location/people search] should be given HIGHEST priority
- The source with the highest confidence match should be prioritized

Question: ${cleanedQuery}

Available Recalls:
${context}

Provide your answer in JSON format: {"answer": "your answer based ONLY on the provided recalls", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}.
If the recalls don't contain the requested information, respond with: {"answer": "I don't have enough information in the provided recalls to answer this question.", "confidence": 0, "sources": []}.`;

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
            role: 'user',
            content: qaPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })
    });

    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('OpenAI QA API error:', errorText);
      console.error('Response status:', qaResponse.status);
      console.error('Response headers:', JSON.stringify(Object.fromEntries(qaResponse.headers.entries())));
      return new Response(JSON.stringify({ error: 'Failed to generate answer', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qaData = await qaResponse.json();
    console.log('OpenAI response received:', JSON.stringify(qaData, null, 2));
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
        answer = qaContent;
        confidence = 50;
      }
    }

    console.log('Answer generated:', answer ? 'Yes' : 'No');
    console.log('Confidence:', confidence);

    const sourceRecallIds = sourcesUsed
      .map((sourceId: string) => {
        const source = contextWithSources.find((c: any) => c.sourceId === sourceId);
        return source ? source.recallId : null;
      })
      .filter((id: string | null) => id !== null);

    console.log('Recall IDs used for answer:', sourceRecallIds);

    const usedRecalls = uniqueRecallMatches
      .filter((match: any) => sourceRecallIds.includes(match.recall_id))
      .sort((a: any, b: any) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        return b.similarity - a.similarity;
      });

    const unusedRecalls = uniqueRecallMatches
      .filter((match: any) => !sourceRecallIds.includes(match.recall_id))
      .sort((a: any, b: any) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        return b.similarity - a.similarity;
      });

    const orderedMatches = [...usedRecalls, ...unusedRecalls];

    console.log(`Ordered results: ${usedRecalls.length} used for answer, ${unusedRecalls.length} others`);

    const matchResults = orderedMatches.map((match: any) => ({
      id: match.recall_id,
      matchPercentage: Math.round(Math.max(0, Math.min(100, match.similarity * 100))),
      usedForAnswer: sourceRecallIds.includes(match.recall_id)
    }));

    const processingTime = Date.now() - startTime;
    console.log('=== Search Recalls V2 completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

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
