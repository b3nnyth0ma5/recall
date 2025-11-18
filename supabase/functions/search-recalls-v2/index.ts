
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Search query:', query);

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const embeddingData = await embeddingResponse.json();
    const embeddingBase64 = embeddingData.data[0].embedding;
    console.log('Embedding generated successfully');
    console.log('Token usage:', JSON.stringify(embeddingData.usage));

    // Decode base64 to get the actual embedding array
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    const embeddingArray = Array.from(float32Array);
    console.log('Decoded embedding array length:', embeddingArray.length);

    // Step 2: Find top 8 closest matches using vector similarity
    console.log('Step 2: Finding top 8 closest matches...');

    // Fetch all recall images with embeddings for this user
    // Cast the vector to text to get the array representation
    const { data: allImages, error: fetchError } = await supabase
      .from('recall_images')
      .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
      .eq('user_id', user.id)
      .not('recall_image_embedding', 'is', null);

    if (fetchError) {
      console.error('Error fetching images:', fetchError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch images',
        details: fetchError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${allImages?.length || 0} images with embeddings`);

    if (!allImages || allImages.length === 0) {
      console.log('No images with embeddings found');
      return new Response(JSON.stringify({
        answer: null,
        confidence: 0,
        results: [],
        processingTimeMs: Date.now() - startTime
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate cosine similarity for each image
    const matchesWithSimilarity = allImages.map((image) => {
      let embedding = image.recall_image_embedding;
      
      // Handle different embedding formats
      // The embedding might be a vector type, string, or array
      if (!embedding) {
        console.log(`Image ${image.id} has null embedding`);
        return {
          id: image.id,
          recall_id: image.recall_id,
          ocr_text: image.ocr_text || '',
          image_explanation: image.image_explanation || '',
          similarity: 0
        };
      }

      // If it's a string (vector type serialized), parse it
      if (typeof embedding === 'string') {
        try {
          // Remove brackets and split by comma
          const cleanStr = embedding.replace(/[\[\]]/g, '');
          embedding = cleanStr.split(',').map(s => parseFloat(s.trim()));
          console.log(`Parsed string embedding for image ${image.id}, length: ${embedding.length}`);
        } catch (e) {
          console.error(`Failed to parse embedding string for image ${image.id}:`, e);
          return {
            id: image.id,
            recall_id: image.recall_id,
            ocr_text: image.ocr_text || '',
            image_explanation: image.image_explanation || '',
            similarity: 0
          };
        }
      }

      // Verify it's an array
      if (!Array.isArray(embedding)) {
        console.log(`Image ${image.id} embedding is not an array, type: ${typeof embedding}`);
        return {
          id: image.id,
          recall_id: image.recall_id,
          ocr_text: image.ocr_text || '',
          image_explanation: image.image_explanation || '',
          similarity: 0
        };
      }

      if (embedding.length === 0) {
        console.log(`Image ${image.id} has empty embedding array`);
        return {
          id: image.id,
          recall_id: image.recall_id,
          ocr_text: image.ocr_text || '',
          image_explanation: image.image_explanation || '',
          similarity: 0
        };
      }

      // Cosine similarity calculation
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      const minLength = Math.min(embeddingArray.length, embedding.length);
      
      for (let i = 0; i < minLength; i++) {
        const a = embeddingArray[i];
        const b = embedding[i];
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
      }

      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

      return {
        id: image.id,
        recall_id: image.recall_id,
        ocr_text: image.ocr_text || '',
        image_explanation: image.image_explanation || '',
        similarity: isNaN(similarity) ? 0 : similarity
      };
    });

    // Sort by similarity (highest first) and take top 8
    matchesWithSimilarity.sort((a, b) => b.similarity - a.similarity);
    const top8Matches = matchesWithSimilarity.slice(0, 8);

    console.log(`Found ${top8Matches.length} matches`);
    if (top8Matches.length > 0) {
      console.log('Top match similarity:', top8Matches[0]?.similarity);
      console.log('Top 3 similarities:', top8Matches.slice(0, 3).map(m => m.similarity));
    }

    // Convert similarity to match percentage (0-100)
    // Cosine similarity ranges from -1 to 1, but for embeddings it's typically 0 to 1
    const matchResults = top8Matches.map((match) => ({
      id: match.id,
      recall_id: match.recall_id,
      ocr_text: match.ocr_text,
      image_explanation: match.image_explanation,
      matchPercentage: Math.round(Math.max(0, Math.min(100, match.similarity * 100)))
    }));

    console.log('Match percentages:', matchResults.map(m => m.matchPercentage));

    // Step 3: Use OpenAI for question answering
    console.log('Step 3: Using OpenAI for question answering...');

    // Prepare context from matches
    const context = matchResults
      .map((match, idx) => 
        `Match ${idx + 1} (${match.matchPercentage}% match):\nOCR Text: ${match.ocr_text}\nImage Explanation: ${match.image_explanation}`
      )
      .join('\n\n');

    const qaSystemPrompt = `You are a helpful assistant that answers questions based on the provided context from image OCR text and explanations. 

Provide concise, accurate answers based only on the information given. If you cannot answer the question with confidence based on the context, say so.

Also provide a confidence score (0-100) indicating how confident you are in your answer based on the available information.`;

    const qaUserPrompt = `Question: ${query}\n\nContext from image matches:\n${context}\n\nProvide your answer and confidence score in JSON format: {"answer": "your answer here", "confidence": 85}`;

    const qaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: qaSystemPrompt },
          { role: 'user', content: qaUserPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qaData = await qaResponse.json();
    const qaContent = qaData.choices?.[0]?.message?.content;

    let answer = null;
    let confidence = 0;

    if (qaContent) {
      try {
        const parsed = JSON.parse(qaContent);
        answer = parsed.answer || null;
        confidence = parsed.confidence || 0;
      } catch (parseError) {
        console.error('Failed to parse QA response:', parseError);
        console.error('QA content:', qaContent);
      }
    }

    console.log('Answer generated:', answer ? 'Yes' : 'No');
    console.log('Confidence:', confidence);

    const processingTime = Date.now() - startTime;
    console.log('=== Search Recalls V2 completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    // Return results with recall_id (not image id)
    return new Response(JSON.stringify({
      answer,
      confidence,
      results: matchResults.map((match) => ({
        id: match.recall_id,  // Return recall_id, not image id
        matchPercentage: match.matchPercentage
      })),
      processingTimeMs: processingTime
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
