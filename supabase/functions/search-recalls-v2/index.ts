import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
Deno.serve(async (req)=>{
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
      return new Response(JSON.stringify({
        error: 'Missing authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
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
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Authenticated user:', user.id);
    // Parse request body
    const { query } = await req.json();
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({
        error: 'Query parameter is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Search query:', query);
    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(JSON.stringify({
        error: 'OpenAI API key not configured'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Step 1: Convert query to embedding using OpenAI
    console.log('Step 1: Converting query to embedding...');
    console.log('Model: text-embedding-3-small');
    console.log('Encoding format: base64');
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'base64'
      })
    });
    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('OpenAI embedding API error:', errorText);
      return new Response(JSON.stringify({
        error: 'Failed to generate embedding',
        details: errorText
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const embeddingData = await embeddingResponse.json();
    const embeddingBase64 = embeddingData.data[0].embedding;
    console.log('Embedding generated successfully');
    console.log('Token usage:', JSON.stringify(embeddingData.usage));
    // Decode base64 to get the actual embedding array
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for(let i = 0; i < binaryString.length; i++){
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    const queryEmbedding = Array.from(float32Array);
    console.log('Decoded query embedding array length:', queryEmbedding.length);
    // Step 2: Find closest matches using vector similarity (>= 20% threshold)
    console.log('Step 2: Finding closest matches with >= 20% similarity...');
    // Fetch all recall images with embeddings for this user
    const { data: allImages, error: fetchImagesError } = await supabase.from('recall_images').select('id, recall_id, ocr_text, image_explanation, recall_image_embedding').eq('user_id', user.id).not('recall_image_embedding', 'is', null);
    if (fetchImagesError) {
      console.error('Error fetching images:', fetchImagesError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch images',
        details: fetchImagesError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Found ${allImages?.length || 0} images with embeddings`);
    // Fetch all recalls with embeddings for this user
    const { data: allRecalls, error: fetchRecallsError } = await supabase.from('recalls').select('id, text, location, location_primary_type, recall_embedding').eq('user_id', user.id).not('recall_embedding', 'is', null);
    if (fetchRecallsError) {
      console.error('Error fetching recalls:', fetchRecallsError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch recalls',
        details: fetchRecallsError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Found ${allRecalls?.length || 0} recalls with embeddings`);
    // Fetch all recall URLs with embeddings for this user
    const { data: allUrls, error: fetchUrlsError } = await supabase.from('recall_urls').select('id, recall_id, url, url_data, recall_url_embedding').eq('user_id', user.id).not('recall_url_embedding', 'is', null);
    if (fetchUrlsError) {
      console.error('Error fetching URLs:', fetchUrlsError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch URLs',
        details: fetchUrlsError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Found ${allUrls?.length || 0} URLs with embeddings`);
    // Helper function to calculate cosine similarity between query embedding and stored embedding
    const calculateCosineSimilarity = (storedEmbedding)=>{
      if (!storedEmbedding) {
        console.log('Stored embedding is null or undefined');
        return 0;
      }
      let storedEmbeddingArray = storedEmbedding;
      // Handle different embedding formats
      if (typeof storedEmbedding === 'string') {
        try {
          // Remove brackets and split by comma
          const cleanStr = storedEmbedding.replace(/[\[\]]/g, '');
          storedEmbeddingArray = cleanStr.split(',').map((s)=>parseFloat(s.trim()));
        } catch (e) {
          console.error('Failed to parse embedding string:', e);
          return 0;
        }
      }
      // Verify it's an array
      if (!Array.isArray(storedEmbeddingArray)) {
        console.log('Stored embedding is not an array after parsing');
        return 0;
      }
      if (storedEmbeddingArray.length === 0) {
        console.log('Stored embedding array is empty');
        return 0;
      }
      // Verify query embedding is valid
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        console.log('Query embedding is invalid');
        return 0;
      }
      // Check if dimensions match
      if (storedEmbeddingArray.length !== queryEmbedding.length) {
        console.log(`Dimension mismatch: stored=${storedEmbeddingArray.length}, query=${queryEmbedding.length}`);
        return 0;
      }
      // Cosine similarity calculation: (A · B) / (||A|| * ||B||)
      let dotProduct = 0;
      let normA = 0; // Norm of query embedding
      let normB = 0; // Norm of stored embedding
      for(let i = 0; i < queryEmbedding.length; i++){
        const queryVal = queryEmbedding[i];
        const storedVal = storedEmbeddingArray[i];
        dotProduct += queryVal * storedVal;
        normA += queryVal * queryVal;
        normB += storedVal * storedVal;
      }
      // Calculate final similarity
      const denominator = Math.sqrt(normA) * Math.sqrt(normB);
      if (denominator === 0) {
        console.log('Denominator is zero, returning 0 similarity');
        return 0;
      }
      const similarity = dotProduct / denominator;
      // Cosine similarity should be between -1 and 1
      // Clamp to this range in case of floating point errors
      const clampedSimilarity = Math.max(-1, Math.min(1, similarity));
      if (isNaN(clampedSimilarity)) {
        console.log('Similarity calculation resulted in NaN');
        return 0;
      }
      return clampedSimilarity;
    };
    // Calculate cosine similarity for each image
    const imageMatches = (allImages || []).map((image)=>{
      const similarity = calculateCosineSimilarity(image.recall_image_embedding);
      return {
        id: image.id,
        recall_id: image.recall_id,
        ocr_text: image.ocr_text || '',
        image_explanation: image.image_explanation || '',
        similarity,
        source: 'image'
      };
    });
    // Calculate cosine similarity for each recall
    const recallMatches = (allRecalls || []).map((recall)=>{
      const similarity = calculateCosineSimilarity(recall.recall_embedding);
      return {
        id: recall.id,
        recall_id: recall.id,
        text: recall.text || '',
        location: recall.location || '',
        location_primary_type: recall.location_primary_type || '',
        similarity,
        source: 'recall'
      };
    });
    // Calculate cosine similarity for each URL
    const urlMatches = (allUrls || []).map((url)=>{
      const similarity = calculateCosineSimilarity(url.recall_url_embedding);
      return {
        id: url.id,
        recall_id: url.recall_id,
        url: url.url || '',
        url_data: url.url_data || '',
        similarity,
        source: 'url'
      };
    });
    // Combine all matches
    const allMatches = [
      ...imageMatches,
      ...recallMatches //,
    ];
    // Log similarity distribution for debugging
    const similarities = allMatches.map((m)=>m.similarity).sort((a, b)=>b - a);
    console.log('Similarity distribution:');
    console.log('  Max:', similarities[0]);
    console.log('  Min:', similarities[similarities.length - 1]);
    console.log('  Mean:', similarities.reduce((a, b)=>a + b, 0) / similarities.length);
    console.log('  Median:', similarities[Math.floor(similarities.length / 2)]);
    console.log('  Top 10:', similarities.slice(0, 10));
    // Filter by >= 20% similarity (0.2 cosine similarity)
    const SIMILARITY_THRESHOLD = 0.20;
    const filteredMatches = allMatches.filter((match)=>match.similarity >= SIMILARITY_THRESHOLD);
    // Sort by similarity (highest first)
    filteredMatches.sort((a, b)=>b.similarity - a.similarity);
    console.log(`Found ${filteredMatches.length} matches with >= 20% similarity`);
    if (filteredMatches.length > 0) {
      console.log('Top match similarity:', filteredMatches[0]?.similarity);
      console.log('Top 5 similarities:', filteredMatches.slice(0, 5).map((m)=>m.similarity));
    }
    if (filteredMatches.length === 0) {
      console.log('No matches found with >= 20% similarity');
      return new Response(JSON.stringify({
        answer: null,
        confidence: 0,
        results: [],
        processingTimeMs: Date.now() - startTime
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Group matches by recall_id and keep the highest similarity for each recall
    const recallMatchMap = new Map();
    for (const match of filteredMatches){
      const existing = recallMatchMap.get(match.recall_id);
      if (!existing || match.similarity > existing.similarity) {
        recallMatchMap.set(match.recall_id, match);
      }
    }
    // Convert back to array and sort by similarity
    const uniqueRecallMatches = Array.from(recallMatchMap.values()).sort((a, b)=>b.similarity - a.similarity);
    console.log(`Grouped into ${uniqueRecallMatches.length} unique recalls`);
    // Step 3: Use OpenAI for question answering with source tracking
    console.log('Step 3: Using OpenAI for question answering with source tracking...');
    // Prepare context from matches with source IDs
    const contextWithSources = uniqueRecallMatches.map((match, idx)=>{
      const sourceId = `SOURCE_${idx + 1}`;
      if (match.source === 'image') {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from image):\nOCR Text: ${match.ocr_text}\nImage Explanation: ${match.image_explanation}`,
          similarity: match.similarity
        };
      } else if (match.source === 'url') {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from URL):\nURL: ${match.url}`,
          similarity: match.similarity
        };
      } else {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from recall):\nText: ${match.text}\nLocation: ${match.location}\nLocation Type: ${match.location_primary_type}`,
          similarity: match.similarity
        };
      }
    });
    const context = contextWithSources.map((c)=>c.text).join('\n\n');
    const qaSystemPrompt = `You are an accurate search assistant that understands the intent of the user's question and provides answers based on the provided information. Provide exact answer in under 120 words, based only on the information provided to you. 
    Use bullet points when listing things.
    You're also a NER expert that identifies calendar/date/time entities and names of people; and uses this to provide more relevant answers.
    If you cannot answer the question with confidence based on the provided information, say so. 
    Also provide a confidence score (0-100) indicating how confident you are in your answer. /n
    VERY IMPORTANT: The source with the highest match percentage should always be given the most priority when answering.
    IMPORTANT: If the user's question includes the name of a location (or is proximity based) then prioritise the information that's most relevant to the Location and Location Type provided.`;
    const qaUserPrompt = `Question: ${query}\n\nRecalls from matches:\n${context}\n\nProvide your answer in JSON format: {"answer": "your answer here", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}`;
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
            content: qaSystemPrompt
          },
          {
            role: 'user',
            content: qaUserPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: {
          type: 'json_object'
        }
      })
    });
    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('OpenAI QA API error:', errorText);
      return new Response(JSON.stringify({
        error: 'Failed to generate answer',
        details: errorText
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const qaData = await qaResponse.json();
    const qaContent = qaData.choices?.[0]?.message?.content;
    let answer = null;
    let confidence = 0;
    let sourcesUsed = [];
    if (qaContent) {
      try {
        const parsed = JSON.parse(qaContent);
        answer = parsed.answer || null;
        confidence = parsed.confidence || 0;
        sourcesUsed = parsed.sources || [];
        console.log('Sources used by AI:', sourcesUsed);
      } catch (parseError) {
        console.error('Failed to parse QA response:', parseError);
        console.error('QA content:', qaContent);
      }
    }
    console.log('Answer generated:', answer ? 'Yes' : 'No');
    console.log('Confidence:', confidence);
    // Map source IDs back to recall IDs
    const sourceRecallIds = sourcesUsed.map((sourceId)=>{
      const source = contextWithSources.find((c)=>c.sourceId === sourceId);
      return source ? source.recallId : null;
    }).filter((id)=>id !== null);
    console.log('Recall IDs used for answer:', sourceRecallIds);
    // Create results with proper ordering:
    // 1. First, the recalls that were used to derive the answer (sorted by similarity)
    // 2. Then, the remaining recalls (sorted by similarity)
    const usedRecalls = uniqueRecallMatches.filter((match)=>sourceRecallIds.includes(match.recall_id)).sort((a, b)=>b.similarity - a.similarity);
    const unusedRecalls = uniqueRecallMatches.filter((match)=>!sourceRecallIds.includes(match.recall_id)).sort((a, b)=>b.similarity - a.similarity);
    const orderedMatches = [
      ...usedRecalls,
      ...unusedRecalls
    ];
    console.log(`Ordered results: ${usedRecalls.length} used for answer, ${unusedRecalls.length} others`);
    // Convert similarity to match percentage (0-100)
    const matchResults = orderedMatches.map((match)=>({
        id: match.recall_id,
        matchPercentage: Math.round(Math.max(0, Math.min(100, match.similarity * 100))),
        usedForAnswer: sourceRecallIds.includes(match.recall_id)
      }));
    console.log('Match percentages:', matchResults.map((m)=>`${m.matchPercentage}% ${m.usedForAnswer ? '(used)' : ''}`));
    const processingTime = Date.now() - startTime;
    console.log('=== Search Recalls V2 completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');
    // Return results with recall_id
    return new Response(JSON.stringify({
      answer,
      confidence,
      results: matchResults,
      processingTimeMs: processingTime
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
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
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
