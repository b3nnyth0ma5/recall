
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

interface RecallRecord {
  id: string;
  text: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface SearchResult {
  id: string;
  text: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  relevance_score: number;
  relevance_reason: string;
  created_at: string;
  updated_at: string;
}

interface ScoredResult {
  id: string;
  relevance_score: number;
  relevance_reason: string;
}

Deno.serve(async (req) => {
  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const { query, limit = 10 } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Search query:', query);
    console.log('Result limit:', limit);

    // Fetch all recalls for the user
    const { data: recalls, error: recallsError } = await supabase
      .from('recalls')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (recallsError) {
      console.error('Error fetching recalls:', recallsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch recalls' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!recalls || recalls.length === 0) {
      console.log('No recalls found for user');
      return new Response(
        JSON.stringify({ results: [], total: 0, query }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${recalls.length} recalls for user`);

    // Fetch all images with OCR data for these recalls
    const recallIds = recalls.map((r) => r.id);
    const { data: images, error: imagesError } = await supabase
      .from('recall_images')
      .select('id, recall_id, ocr_text, image_explanation')
      .in('recall_id', recallIds);

    if (imagesError) {
      console.error('Error fetching images:', imagesError);
      // Continue without images if there's an error
    }

    console.log(`Found ${images?.length || 0} images with OCR data`);

    // Create a map of recall_id to images
    const imagesByRecallId = new Map();
    if (images) {
      images.forEach((img) => {
        if (!imagesByRecallId.has(img.recall_id)) {
          imagesByRecallId.set(img.recall_id, []);
        }
        imagesByRecallId.get(img.recall_id).push(img);
      });
    }

    // Prepare data for OpenAI with OCR information
    const recallsWithOCR = recalls.map((recall) => {
      const recallImages = imagesByRecallId.get(recall.id) || [];
      const ocrTexts = recallImages
        .map((img) => img.ocr_text)
        .filter((text) => text && text !== 'No text detected.')
        .join(' | ');
      const explanations = recallImages
        .map((img) => img.image_explanation)
        .filter((exp) => exp)
        .join(' | ');

      return {
        id: recall.id,
        text: recall.text || '',
        location: recall.location || '',
        location_primary_type: recall.location_primary_type || '',
        latitude: recall.latitude,
        longitude: recall.longitude,
        ocr_text: ocrTexts || '',
        image_explanation: explanations || '',
      };
    });

    // Construct the OpenAI prompt
    const systemPrompt = `You are an intelligent search assistant that analyzes user notes/recalls and ranks them by relevance to a search query.

Your task:
1. Analyze the search query to extract key entities (people, places, products, dates, etc.)
2. Compare the query against each recall's text, location, coordinates, OCR text from images, and AI-generated image explanations
3. Score each recall from 0-100 based on relevance
4. Provide a brief reason (max 30 words) for each match

Scoring criteria:
- Exact text matches: 90-100
- Location matches: 70-89
- OCR text matches: 70-89
- Image explanation matches: 70-89
- Geographic proximity: 70-90
- Semantic similarity: 60-69
- Related concepts: 40-59
- Weak connection: 20-39
- No connection: 0-19

Consider location primary type, OCR text and image explanations as important sources of information, especially when the main text is sparse.

Return ONLY a valid JSON array with this exact structure (no markdown, no extra text):
[{"id":"recall-id","relevance_score":95,"relevance_reason":"Brief explanation"}]

Return only the top ${limit} most relevant results, sorted by score (highest first).`;

    const userPrompt = `Search query: "${query}"

Recalls to analyze:
${JSON.stringify(recallsWithOCR, null, 2)}

Return the top ${limit} most relevant recalls as a JSON array.`;

    console.log('Calling OpenAI API...');
    console.log('Prompt size (chars):', systemPrompt.length + userPrompt.length);

    // Call OpenAI API
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Valid model - gpt-5-nano does not exist
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 1500, // Increased from 500 to prevent truncation
          response_format: { type: 'json_object' },
        }),
      }
    );

    console.log('OpenAI response status:', openaiResponse.status);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error response:', errorText);
      console.error('OpenAI API status:', openaiResponse.status);
      
      // Try to parse error details
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.error?.message || errorText;
      } catch (e) {
        console.log('Could not parse error as JSON');
      }

      return new Response(
        JSON.stringify({
          error: 'OpenAI API request failed',
          details: errorDetails,
          status: openaiResponse.status,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiData = await openaiResponse.json();
    console.log('OpenAI response received');

    // Check for OpenAI error in response
    if (openaiData.error) {
      console.error('OpenAI API returned error:', openaiData.error);
      return new Response(
        JSON.stringify({
          error: 'OpenAI API error',
          details: openaiData.error.message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse the OpenAI response
    const responseContent = openaiData.choices?.[0]?.message?.content;
    if (!responseContent) {
      console.error('No content in OpenAI response');
      console.error('Full OpenAI response:', JSON.stringify(openaiData, null, 2));
      return new Response(
        JSON.stringify({
          error: 'Invalid OpenAI response - no content',
          details:
            'OpenAI returned an empty response. This may be due to content filtering or API issues.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Response content length:', responseContent.length);
    console.log('Response content preview (first 300 chars):', responseContent.substring(0, 300));
    console.log('Response content preview (last 300 chars):', responseContent.substring(Math.max(0, responseContent.length - 300)));

    // Check if response was truncated
    const finishReason = openaiData.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('WARNING: OpenAI response was truncated due to max_tokens limit');
    }
    console.log('Finish reason:', finishReason);

    // Extract JSON from the response (handle markdown code blocks)
    let jsonContent = responseContent.trim();
    
    // Remove markdown code blocks if present
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    // Remove any trailing incomplete JSON
    jsonContent = jsonContent.trim();
    
    // If the JSON doesn't end with ] or }, try to find the last complete object
    if (!jsonContent.endsWith(']') && !jsonContent.endsWith('}')) {
      console.warn('JSON appears truncated, attempting to fix...');
      
      // Find the last complete object in an array
      const lastCompleteObjectIndex = jsonContent.lastIndexOf('}');
      if (lastCompleteObjectIndex !== -1) {
        jsonContent = jsonContent.substring(0, lastCompleteObjectIndex + 1);
        
        // If we're in an array, close it
        if (jsonContent.trim().startsWith('[')) {
          jsonContent += ']';
        }
      }
    }

    console.log('Cleaned JSON content preview (first 300 chars):', jsonContent.substring(0, 300));
    console.log('Cleaned JSON content preview (last 300 chars):', jsonContent.substring(Math.max(0, jsonContent.length - 300)));

    let scoredResults: ScoredResult[];
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Handle both array and object responses
      if (Array.isArray(parsed)) {
        scoredResults = parsed;
      } else if (parsed.results && Array.isArray(parsed.results)) {
        scoredResults = parsed.results;
      } else {
        console.error('Unexpected response format:', parsed);
        throw new Error('Response is not an array or does not contain a results array');
      }
      
      console.log(`Parsed ${scoredResults.length} scored results`);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.error('Parse error message:', parseError instanceof Error ? parseError.message : 'Unknown');
      console.error('Content that failed to parse (full):', jsonContent);
      
      return new Response(
        JSON.stringify({
          error: 'Failed to parse OpenAI response',
          details: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          contentPreview: jsonContent.substring(0, 500),
          finishReason: finishReason,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Merge the scores with the original recall data
    const results = scoredResults
      .map((scored) => {
        const recall = recalls.find((r) => r.id === scored.id);
        if (!recall) return null;

        return {
          id: recall.id,
          text: recall.text,
          location: recall.location,
          latitude: recall.latitude,
          longitude: recall.longitude,
          relevance_score: scored.relevance_score,
          relevance_reason: scored.relevance_reason,
          created_at: recall.created_at,
          updated_at: recall.updated_at,
        };
      })
      .filter((r): r is SearchResult => r !== null)
      .slice(0, limit);

    console.log(`Returning ${results.length} results`);

    return new Response(
      JSON.stringify({
        results,
        total: results.length,
        query,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in search-recalls function:', error);
    console.error(
      'Error stack:',
      error instanceof Error ? error.stack : 'No stack trace'
    );
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
