
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
    const { query, recallIds } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Search query:', query);
    console.log('Location-filtered recall IDs:', recallIds ? `${recallIds.length} IDs` : 'None');

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 0: Use NLP NER to detect people names in the query
    console.log('Step 0: Detecting people names using NLP NER...');
    let peopleRecallIds: string[] = [];
    let detectedPersonNames: string[] = [];
    let matchedPersonNames: string[] = [];
    
    try {
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
              content: 'You are a Named Entity Recognition (NER) expert. Extract all person names from the user\'s query. Return only the names as a JSON array of strings. If no names are found, return an empty array.'
            },
            {
              role: 'user',
              content: `Extract person names from this query: "${query}"`
            }
          ],
          temperature: 0.1,
          max_tokens: 200,
          response_format: { type: 'json_object' }
        })
      });

      if (nerResponse.ok) {
        const nerData = await nerResponse.json();
        const nerContent = nerData.choices?.[0]?.message?.content;
        
        if (nerContent) {
          try {
            const parsed = JSON.parse(nerContent);
            const detectedNames = parsed.names || parsed.persons || parsed.people || [];
            
            if (Array.isArray(detectedNames) && detectedNames.length > 0) {
              detectedPersonNames = detectedNames;
              console.log('Detected person names:', detectedPersonNames);
              
              // Search for these people in the Persons table
              const { data: personsData, error: personsError } = await supabase
                .from('persons')
                .select('id, person_name')
                .eq('user_id', user.id);
              
              if (!personsError && personsData && personsData.length > 0) {
                // Find matching persons (case-insensitive partial match)
                const matchingPersonIds: string[] = [];
                
                for (const detectedName of detectedNames) {
                  const normalizedDetected = detectedName.toLowerCase().trim();
                  
                  for (const person of personsData) {
                    const normalizedPerson = person.person_name.toLowerCase().trim();
                    
                    // Check if either name contains the other (partial match)
                    if (normalizedPerson.includes(normalizedDetected) || 
                        normalizedDetected.includes(normalizedPerson)) {
                      matchingPersonIds.push(person.id);
                      matchedPersonNames.push(person.person_name);
                      console.log(`Matched "${detectedName}" to person "${person.person_name}"`);
                    }
                  }
                }
                
                if (matchingPersonIds.length > 0) {
                  // Get recalls mentioning these people
                  const { data: recallPeopleData, error: recallPeopleError } = await supabase
                    .from('recall_people')
                    .select('recall_id')
                    .in('person_id', matchingPersonIds)
                    .eq('user_id', user.id);
                  
                  if (!recallPeopleError && recallPeopleData && recallPeopleData.length > 0) {
                    peopleRecallIds = [...new Set(recallPeopleData.map((rp: any) => rp.recall_id))];
                    console.log(`Found ${peopleRecallIds.length} recalls mentioning detected people`);
                  }
                }
              }
            }
          } catch (parseError) {
            console.error('Failed to parse NER response:', parseError);
          }
        }
      }
    } catch (nerError) {
      console.error('Error in NER detection:', nerError);
      // Continue with normal search even if NER fails
    }

    // Step 1: Convert query to embedding using OpenAI
    console.log('Step 1: Converting query to embedding...');
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
      return new Response(JSON.stringify({ error: 'Failed to generate embedding', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const embeddingData = await embeddingResponse.json();
    const embeddingBase64 = embeddingData.data[0].embedding;
    console.log('Embedding generated successfully');

    // Decode base64 to get the actual embedding array
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    const queryEmbedding = Array.from(float32Array);

    console.log('Decoded query embedding array length:', queryEmbedding.length);

    // Step 2: Find closest matches using vector similarity (>= 20% threshold)
    console.log('Step 2: Finding closest matches with >= 20% similarity...');
    
    // Build query for images
    let imagesQuery = supabase
      .from('recall_images')
      .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
      .eq('user_id', user.id)
      .not('recall_image_embedding', 'is', null);

    // Build query for recalls
    let recallsQuery = supabase
      .from('recalls')
      .select('id, text, location, location_primary_type, recall_embedding')
      .eq('user_id', user.id)
      .not('recall_embedding', 'is', null);

    // If recallIds provided (location-filtered), only search within those recalls
    if (recallIds && Array.isArray(recallIds) && recallIds.length > 0) {
      console.log(`Filtering to ${recallIds.length} location-filtered recalls`);
      imagesQuery = imagesQuery.in('recall_id', recallIds);
      recallsQuery = recallsQuery.in('id', recallIds);
    }

    // Fetch images
    const { data: allImages, error: fetchImagesError } = await imagesQuery;
    if (fetchImagesError) {
      console.error('Error fetching images:', fetchImagesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch images', details: fetchImagesError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`Found ${allImages?.length || 0} images with embeddings`);

    // Fetch recalls
    const { data: allRecalls, error: fetchRecallsError } = await recallsQuery;
    if (fetchRecallsError) {
      console.error('Error fetching recalls:', fetchRecallsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls', details: fetchRecallsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`Found ${allRecalls?.length || 0} recalls with embeddings`);

    // Helper function to calculate cosine similarity
    const calculateCosineSimilarity = (storedEmbedding: any) => {
      if (!storedEmbedding) return 0;

      let storedEmbeddingArray = storedEmbedding;

      // Handle different embedding formats
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

      // Cosine similarity calculation
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

    // Calculate cosine similarity for each image
    const imageMatches = (allImages || []).map((image: any) => {
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
    const recallMatches = (allRecalls || []).map((recall: any) => {
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

    // Combine all matches
    const allMatches = [...imageMatches, ...recallMatches];

    // Filter by >= 20% similarity (0.2 cosine similarity)
    const SIMILARITY_THRESHOLD = 0.20;
    const filteredMatches = allMatches.filter((match: any) => match.similarity >= SIMILARITY_THRESHOLD);

    // Sort by similarity (highest first)
    filteredMatches.sort((a: any, b: any) => b.similarity - a.similarity);

    console.log(`Found ${filteredMatches.length} matches with >= 20% similarity`);

    // Group matches by recall_id and keep the highest similarity for each recall
    const recallMatchMap = new Map();
    for (const match of filteredMatches) {
      const existing = recallMatchMap.get(match.recall_id);
      if (!existing || match.similarity > existing.similarity) {
        recallMatchMap.set(match.recall_id, match);
      }
    }

    // Convert back to array and sort by similarity
    let uniqueRecallMatches = Array.from(recallMatchMap.values()).sort((a: any, b: any) => b.similarity - a.similarity);
    console.log(`Grouped into ${uniqueRecallMatches.length} unique recalls`);

    // Step 2.5: Add people-related recalls to the final set
    if (peopleRecallIds.length > 0) {
      console.log('Step 2.5: Adding people-related recalls to the final set...');
      
      // Fetch full recall data for people-related recalls
      const { data: peopleRecalls, error: peopleRecallsError } = await supabase
        .from('recalls')
        .select('id, text, location, location_primary_type')
        .in('id', peopleRecallIds)
        .eq('user_id', user.id);
      
      if (!peopleRecallsError && peopleRecalls && peopleRecalls.length > 0) {
        // Add these recalls to the unique matches if not already present
        const existingRecallIds = new Set(uniqueRecallMatches.map((m: any) => m.recall_id));
        
        for (const recall of peopleRecalls) {
          if (!existingRecallIds.has(recall.id)) {
            // Add with high similarity to prioritize them
            uniqueRecallMatches.push({
              id: recall.id,
              recall_id: recall.id,
              text: recall.text || '',
              location: recall.location || '',
              location_primary_type: recall.location_primary_type || '',
              similarity: 0.95, // High similarity to prioritize
              source: 'recall',
              fromPeopleSearch: true
            });
            console.log(`Added people-related recall: ${recall.id}`);
          } else {
            // Mark existing recall as from people search
            const existingMatch = uniqueRecallMatches.find((m: any) => m.recall_id === recall.id);
            if (existingMatch) {
              existingMatch.fromPeopleSearch = true;
            }
          }
        }
        
        // Re-sort to prioritize people-related recalls
        uniqueRecallMatches.sort((a: any, b: any) => {
          // Prioritize people-related recalls
          if (a.fromPeopleSearch && !b.fromPeopleSearch) return -1;
          if (!a.fromPeopleSearch && b.fromPeopleSearch) return 1;
          // Then sort by similarity
          return b.similarity - a.similarity;
        });
        
        console.log(`Final set contains ${uniqueRecallMatches.length} unique recalls (${peopleRecalls.length} from people search)`);
      }
    }

    if (uniqueRecallMatches.length === 0) {
      console.log('No matches found');
      return new Response(JSON.stringify({
        answer: null,
        confidence: 0,
        results: [],
        processingTimeMs: Date.now() - startTime,
        personInfo: matchedPersonNames.length > 0 ? {
          detectedNames: detectedPersonNames,
          matchedNames: matchedPersonNames,
        } : null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: Use OpenAI gpt-5-mini for question answering with source tracking
    console.log('Step 3: Using OpenAI gpt-5-mini for question answering with source tracking...');

    // Prepare context from matches with source IDs
    const contextWithSources = uniqueRecallMatches.map((match: any, idx: number) => {
      const sourceId = `SOURCE_${idx + 1}`;
      const priorityMarker = match.fromPeopleSearch ? ' [PRIORITY - Contains mentioned person]' : '';
      
      if (match.source === 'image') {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from image${priorityMarker}):\nOCR Text: ${match.ocr_text}\nImage Explanation: ${match.image_explanation}`,
          similarity: match.similarity,
          fromPeopleSearch: match.fromPeopleSearch || false
        };
      } else {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from recall${priorityMarker}):\nText: ${match.text}\nLocation: ${match.location}\nLocation Type: ${match.location_primary_type}`,
          similarity: match.similarity,
          fromPeopleSearch: match.fromPeopleSearch || false
        };
      }
    });

    const context = contextWithSources.map((c: any) => c.text).join('\n\n');

    const qaPrompt = `You are an accurate search assistant that understands the intent of the user's question and provides answers based on the provided information. Provide exact answer in under 120 words, based only on the information provided to you. 
Use bullet points when listing things.
You're also a NER expert that identifies calendar/date/time entities and names of people; and uses this to provide more relevant answers.
If you cannot answer the question with confidence based on the provided information, say so. 
Also provide a confidence score (0-100) indicating how confident you are in your answer.
VERY IMPORTANT: The source with the highest match percentage should always be given the most priority when answering.
VERY IMPORTANT: Sources marked as [PRIORITY - Contains mentioned person] should be given HIGHEST priority as they contain people's names mentioned in the query.
IMPORTANT: If the user's question includes the name of a location (or is proximity based) then prioritise the information that's most relevant to the Location and Location Type provided.

Question: ${query}

Recalls from matches:
${context}

Provide your answer in JSON format: {"answer": "your answer here", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}`;

    console.log('Making request to OpenAI gpt-5-mini with reasoning effort: medium and verbosity: low...');
    const qaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { 
            role: 'user', 
            content: qaPrompt 
          }
        ],
        reasoning: {
          effort: 'medium'
        },
        text: {
          verbosity: 'low'
        },
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

    // Create results with proper ordering
    const usedRecalls = uniqueRecallMatches
      .filter((match: any) => sourceRecallIds.includes(match.recall_id))
      .sort((a: any, b: any) => b.similarity - a.similarity);

    const unusedRecalls = uniqueRecallMatches
      .filter((match: any) => !sourceRecallIds.includes(match.recall_id))
      .sort((a: any, b: any) => b.similarity - a.similarity);

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
      personInfo: matchedPersonNames.length > 0 ? {
        detectedNames: detectedPersonNames,
        matchedNames: matchedPersonNames,
      } : null,
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
