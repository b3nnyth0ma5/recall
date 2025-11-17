
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

/**
 * Use OpenAI to extract location entities from search query using NER
 */
async function extractLocationEntities(query: string, openaiApiKey: string) {
  try {
    console.log('Extracting location entities from query:', query);

    const systemPrompt = `You are a Named Entity Recognition (NER) expert specializing in location and proximity detection.

Your task is to analyze search queries and extract location-based intent.

Detect:
1. Exact location mentions (e.g., "Sydney", "Eiffel Tower", "Central Park")
2. Proximity-based searches (e.g., "near me", "within 5km", "nearby", "close to")
3. Location context (e.g., "at the beach", "in the city", "downtown")

Return a JSON object with this structure:
{
  "hasLocationIntent": true/false,
  "location": "extracted location name or null",
  "proximity": number (in kilometers) or null,
  "type": "exact" | "near" | "within" | null,
  "cleanedQuery": "query with location part removed"
}

Examples:
- "coffee shops near Sydney Opera House" → {"hasLocationIntent": true, "location": "Sydney Opera House", "proximity": 5, "type": "near", "cleanedQuery": "coffee shops"}
- "restaurants within 10km of Melbourne CBD" → {"hasLocationIntent": true, "location": "Melbourne CBD", "proximity": 10, "type": "within", "cleanedQuery": "restaurants"}
- "photos at the beach" → {"hasLocationIntent": true, "location": "beach", "proximity": null, "type": "exact", "cleanedQuery": "photos"}
- "my birthday party" → {"hasLocationIntent": false, "location": null, "proximity": null, "type": null, "cleanedQuery": "my birthday party"}

If no location intent is detected, return hasLocationIntent: false.`;

    const userPrompt = `Analyze this search query for location intent:\n\n"${query}"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI NER API error:', errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.log('No content in OpenAI NER response');
      return null;
    }

    // Parse JSON response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const nerResult = JSON.parse(jsonContent);
    console.log('NER result:', nerResult);

    return nerResult;
  } catch (error) {
    console.error('Error extracting location entities:', error);
    return null;
  }
}

/**
 * Search for a place using Google Places API
 */
async function searchGooglePlaces(locationQuery: string, googleApiKey: string) {
  try {
    console.log('Searching Google Places for:', locationQuery);

    const baseUrl = 'https://places.googleapis.com/v1/places:searchText';
    const requestBody = {
      textQuery: locationQuery,
      languageCode: 'en',
      maxResultCount: 1,
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    if (!data.places || data.places.length === 0) {
      console.log('No places found for:', locationQuery);
      return null;
    }

    const place = data.places[0];
    return {
      placeId: place.id,
      displayName: place.displayName?.text || 'Unknown Place',
      formattedAddress: place.formattedAddress || '',
      latitude: place.location?.latitude || 0,
      longitude: place.location?.longitude || 0,
    };
  } catch (error) {
    console.error('Error searching Google Places:', error);
    return null;
  }
}

/**
 * Filter search results based on location proximity
 */
function filterByLocation(results: any[], targetLocation: any, proximityKm: number) {
  console.log(`Filtering results within ${proximityKm}km of location:`, targetLocation);

  const filtered = results.filter((result) => {
    // If the recall doesn't have location data, exclude it
    if (!result.latitude || !result.longitude) {
      console.log(`Excluding result ${result.id} - no location data`);
      return false;
    }

    const distance = calculateDistance(
      targetLocation.latitude,
      targetLocation.longitude,
      result.latitude,
      result.longitude
    );

    console.log(`Result ${result.id} distance: ${distance.toFixed(2)}km`);
    return distance <= proximityKm;
  });

  // Sort by distance
  filtered.sort((a, b) => {
    const distA = calculateDistance(
      targetLocation.latitude,
      targetLocation.longitude,
      a.latitude,
      a.longitude
    );
    const distB = calculateDistance(
      targetLocation.latitude,
      targetLocation.longitude,
      b.latitude,
      b.longitude
    );
    return distA - distB;
  });

  console.log(`Filtered ${filtered.length} results within ${proximityKm}km`);
  return filtered;
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
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('Search query:', query);
    console.log('Result limit:', limit);

    // Get API keys
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

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

    // Step 1: Apply NLP NER to detect location intent
    console.log('Step 1: Applying NLP NER for location detection...');
    const locationEntity = await extractLocationEntities(query, openaiApiKey);

    // Determine the query to use for search ranking
    const searchQuery = locationEntity?.hasLocationIntent && locationEntity.cleanedQuery
      ? locationEntity.cleanedQuery
      : query;

    console.log('Search query for ranking:', searchQuery);
    console.log('Location entity:', locationEntity);

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
        JSON.stringify({
          hasLocationIntent: locationEntity?.hasLocationIntent || false,
          location: locationEntity?.location || null,
          proximity: locationEntity?.proximity || null,
          type: locationEntity?.type || null,
          cleanedQuery: locationEntity?.cleanedQuery || query,
          answer: null,
          confidence: 0,
          results: [],
          total: 0,
          query,
        }),
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
        created_at: recall.created_at,
        ocr_text: ocrTexts || '',
        image_explanation: explanations || '',
      };
    });

    // Construct the OpenAI prompt with question-answering capabilities
    const systemPrompt = `You are an intelligent search assistant and question-answering expert that analyzes user recalls.

Your dual task:
1. QUESTION ANSWERING: If the user's query is a question, attempt to answer it based on the recall data. Provide a concise answer (under 70 words). Include a confidence score (0-100).
2. SEARCH RANKING: Analyze and rank recalls by relevance to the search query.

For Question Answering:
- Analyze if the query is asking a question (who, what, when, where, why, how, or implied questions)
- Search through all recall text, location, location types, date created, OCR text, and image explanations for relevant information
- Synthesize a clear, concise answer
- Assign a confidence score based on how certain you are about the answer
- Keep answers under 70 words

For Search Ranking:
- Extract key entities (people, places, products, dates, etc.) from the query
- Compare the query against each recall's text, created date, location, location type, OCR text, and image explanations
- Score each recall from 0-100 based on relevance
- Provide a brief reason (max 30 words) for each match

Scoring criteria:
- Exact text matches: 90-100
- Location, proximity, OCR text and image explanation matches: 70-89
- Semantic similarity: 60-69
- Related concepts: 40-59
- No or Weak connection: 0-39

Consider location primary type, OCR text and image explanations as important sources of information, especially when the main text is sparse.

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "answer": "Your concise answer here or null if confidence < 70%",
  "confidence": 85,
  "results": [{"id":"recall-id","relevance_score":95,"relevance_reason":"Brief explanation"}]
}

Include only the top ${limit} most relevant results in the results array, sorted by score (highest first).`;

    const userPrompt = `Search query: "${searchQuery}"

Recalls to analyze:
${JSON.stringify(recallsWithOCR, null, 2)}

Return a JSON object with:
1. An "answer" field (string or null) - answer the question if confidence >= 70%
2. A "confidence" field (number 0-100) - your confidence in the answer
3. A "results" array with the top ${limit} most relevant recalls`;

    console.log('Calling OpenAI API...');
    console.log('Prompt size (chars):', systemPrompt.length + userPrompt.length);

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    console.log('OpenAI response status:', openaiResponse.status);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error response:', errorText);
      console.error('OpenAI API status:', openaiResponse.status);
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
    console.log(
      'Response content preview (first 500 chars):',
      responseContent.substring(0, 500)
    );
    console.log(
      'Response content preview (last 300 chars):',
      responseContent.substring(Math.max(0, responseContent.length - 300))
    );

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

    // If the JSON doesn't end properly, try to fix it
    if (!jsonContent.endsWith('}') && !jsonContent.endsWith(']')) {
      console.warn('JSON appears truncated, attempting to fix...');
      const lastCompleteObjectIndex = jsonContent.lastIndexOf('}');
      if (lastCompleteObjectIndex !== -1) {
        jsonContent = jsonContent.substring(0, lastCompleteObjectIndex + 1);
        if (jsonContent.includes('"results":[')) {
          const openBrackets = (jsonContent.match(/\[/g) || []).length;
          const closeBrackets = (jsonContent.match(/\]/g) || []).length;
          const openBraces = (jsonContent.match(/\{/g) || []).length;
          const closeBraces = (jsonContent.match(/\}/g) || []).length;

          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            jsonContent += ']';
          }
          for (let i = 0; i < openBraces - closeBraces; i++) {
            jsonContent += '}';
          }
        }
      }
    }

    console.log(
      'Cleaned JSON content preview (first 500 chars):',
      jsonContent.substring(0, 500)
    );
    console.log(
      'Cleaned JSON content preview (last 300 chars):',
      jsonContent.substring(Math.max(0, jsonContent.length - 300))
    );

    let scoredResults;
    let answerText = null;
    let answerConfidence = 0;

    try {
      const parsed = JSON.parse(jsonContent);
      console.log('Parsed response structure:', Object.keys(parsed));

      // Extract answer and confidence
      if (parsed.answer !== undefined) {
        answerText = parsed.answer;
        console.log(
          'Answer extracted:',
          answerText ? `"${answerText.substring(0, 100)}..."` : 'null'
        );
      }
      if (parsed.confidence !== undefined) {
        answerConfidence = parsed.confidence;
        console.log('Confidence extracted:', answerConfidence);
      }

      // Handle the response - it should be an object with a "results" property
      if (parsed.results && Array.isArray(parsed.results)) {
        scoredResults = parsed.results;
        console.log(
          `Successfully parsed ${scoredResults.length} scored results from results array`
        );
      } else if (Array.isArray(parsed)) {
        // Fallback: if somehow we got an array directly (shouldn't happen with json_object mode)
        scoredResults = parsed;
        console.log(`Parsed ${scoredResults.length} scored results from direct array`);
      } else {
        console.error('Unexpected response format. Expected object with "results" array.');
        console.error('Parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 500));
        const possibleArrays = Object.values(parsed).filter((val) => Array.isArray(val));
        if (possibleArrays.length > 0) {
          scoredResults = possibleArrays[0];
          console.log(`Found array in response with ${scoredResults.length} items`);
        } else {
          throw new Error('Response does not contain a results array or any valid array');
        }
      }

      // Validate the structure of scored results
      if (scoredResults.length > 0) {
        const firstResult = scoredResults[0];
        if (!firstResult.id || typeof firstResult.relevance_score !== 'number') {
          console.warn('Warning: Results may have unexpected structure:', firstResult);
        }
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.error(
        'Parse error message:',
        parseError instanceof Error ? parseError.message : 'Unknown'
      );
      console.error('Content that failed to parse (full):', jsonContent);
      return new Response(
        JSON.stringify({
          error: 'Failed to parse OpenAI response',
          details: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          contentPreview: jsonContent.substring(0, 1000),
          finishReason: finishReason,
          hint: 'The OpenAI response was not in the expected format. This may be due to response truncation or an unexpected response structure.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Total scored results before filtering: ${scoredResults.length}`);

    // Filter results to only include those with relevance_score >= 75
    const filteredScoredResults = scoredResults.filter((scored) => scored.relevance_score >= 75);
    console.log(
      `Scored results after filtering (relevance >= 75): ${filteredScoredResults.length}`
    );

    // Merge the scores with the original recall data
    let results = filteredScoredResults
      .map((scored) => {
        const recall = recalls.find((r) => r.id === scored.id);
        if (!recall) {
          console.warn(`Warning: Could not find recall with id ${scored.id}`);
          return null;
        }
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
      .filter((r) => r !== null);

    console.log(`Results after merging with recalls: ${results.length}`);

    // Step 2: Apply location filtering if location intent was detected
    if (locationEntity?.hasLocationIntent && locationEntity.location && googleApiKey) {
      console.log('Step 2: Applying location filtering...');
      console.log('Resolving location with Google Places API...');

      const placeResult = await searchGooglePlaces(locationEntity.location, googleApiKey);

      if (placeResult) {
        console.log('Location resolved:', placeResult);
        console.log('Filtering results by location proximity...');

        const proximityKm = locationEntity.proximity || 5;
        results = filterByLocation(
          results,
          {
            latitude: placeResult.latitude,
            longitude: placeResult.longitude,
          },
          proximityKm
        );

        console.log(`Results after location filtering: ${results.length}`);
      } else {
        console.log('Could not resolve location - skipping location filtering');
      }
    }

    // Limit results
    results = results.slice(0, limit);
    console.log(`Returning ${results.length} results (all with relevance >= 75)`);

    // Only include answer if confidence is > 70%
    const finalAnswer = answerConfidence > 70 ? answerText : null;
    console.log(
      `Final answer (confidence ${answerConfidence}%):`,
      finalAnswer ? 'Included' : 'Not included (low confidence)'
    );

    return new Response(
      JSON.stringify({
        hasLocationIntent: locationEntity?.hasLocationIntent || false,
        location: locationEntity?.location || null,
        proximity: locationEntity?.proximity || null,
        type: locationEntity?.type || null,
        cleanedQuery: locationEntity?.cleanedQuery || query,
        answer: finalAnswer,
        confidence: answerConfidence,
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
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
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
