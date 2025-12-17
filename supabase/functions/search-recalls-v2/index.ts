
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

    // OPTIMIZATION: Run NER detection and embedding generation in parallel
    console.log('Step 0 & 1: Running NER detection and embedding generation in parallel...');
    const parallelStart = Date.now();

    const [nerResult, embeddingResult] = await Promise.all([
      // NER Detection
      (async () => {
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
                  content: 'Extract person names from the query. Return JSON: {"names": ["name1", "name2"]}. If none, return {"names": []}.'
                },
                {
                  role: 'user',
                  content: query
                }
              ],
              temperature: 0,
              max_tokens: 100,
              response_format: { type: 'json_object' }
            })
          });

          if (!nerResponse.ok) {
            console.error('NER API error:', await nerResponse.text());
            return { detectedNames: [], matchedNames: [], peopleRecallIds: [] };
          }

          const nerData = await nerResponse.json();
          const nerContent = nerData.choices?.[0]?.message?.content;
          
          if (!nerContent) {
            return { detectedNames: [], matchedNames: [], peopleRecallIds: [] };
          }

          const parsed = JSON.parse(nerContent);
          const detectedNames = parsed.names || [];
          
          if (detectedNames.length === 0) {
            return { detectedNames: [], matchedNames: [], peopleRecallIds: [] };
          }

          console.log('Detected person names:', detectedNames);
          
          // Search for these people in the Persons table
          const { data: personsData } = await supabase
            .from('persons')
            .select('id, person_name')
            .eq('user_id', user.id);
          
          if (!personsData || personsData.length === 0) {
            return { detectedNames, matchedNames: [], peopleRecallIds: [] };
          }

          // Find matching persons (case-insensitive partial match)
          const matchingPersonIds: string[] = [];
          const matchedNames: string[] = [];
          
          for (const detectedName of detectedNames) {
            const normalizedDetected = detectedName.toLowerCase().trim();
            
            for (const person of personsData) {
              const normalizedPerson = person.person_name.toLowerCase().trim();
              
              if (normalizedPerson.includes(normalizedDetected) || 
                  normalizedDetected.includes(normalizedPerson)) {
                matchingPersonIds.push(person.id);
                matchedNames.push(person.person_name);
                console.log(`Matched "${detectedName}" to person "${person.person_name}"`);
              }
            }
          }
          
          if (matchingPersonIds.length === 0) {
            return { detectedNames, matchedNames: [], peopleRecallIds: [] };
          }

          // Get recalls mentioning these people
          const { data: recallPeopleData } = await supabase
            .from('recall_people')
            .select('recall_id')
            .in('person_id', matchingPersonIds)
            .eq('user_id', user.id);
          
          const peopleRecallIds = recallPeopleData 
            ? [...new Set(recallPeopleData.map((rp: any) => rp.recall_id))]
            : [];
          
          console.log(`Found ${peopleRecallIds.length} recalls mentioning detected people`);
          
          return { detectedNames, matchedNames, peopleRecallIds };
        } catch (error) {
          console.error('Error in NER detection:', error);
          return { detectedNames: [], matchedNames: [], peopleRecallIds: [] };
        }
      })(),
      
      // Embedding Generation
      (async () => {
        try {
          const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: query,
              encoding_format: 'float'
            })
          });

          if (!embeddingResponse.ok) {
            throw new Error('Failed to generate embedding');
          }

          const embeddingData = await embeddingResponse.json();
          return embeddingData.data[0].embedding;
        } catch (error) {
          console.error('Error generating embedding:', error);
          throw error;
        }
      })()
    ]);

    console.log(`Parallel processing completed in ${Date.now() - parallelStart}ms`);

    const { detectedNames, matchedNames, peopleRecallIds } = nerResult;
    const queryEmbedding = embeddingResult;

    console.log('Query embedding length:', queryEmbedding.length);

    // Step 2: Find closest matches using vector similarity (>= 40% threshold)
    console.log('Step 2: Finding closest matches with >= 40% similarity...');
    
    // OPTIMIZATION: Fetch images and recalls in parallel
    const fetchStart = Date.now();
    
    // Build queries
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

    // If recallIds provided (location-filtered), only search within those recalls
    if (recallIds && Array.isArray(recallIds) && recallIds.length > 0) {
      console.log(`Filtering to ${recallIds.length} location-filtered recalls`);
      imagesQuery = imagesQuery.in('recall_id', recallIds);
      recallsQuery = recallsQuery.in('id', recallIds);
    }

    // OPTIMIZATION: Fetch in parallel
    const [imagesResult, recallsResult] = await Promise.all([
      imagesQuery,
      recallsQuery
    ]);

    console.log(`Data fetching completed in ${Date.now() - fetchStart}ms`);

    if (imagesResult.error) {
      console.error('Error fetching images:', imagesResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch images' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (recallsResult.error) {
      console.error('Error fetching recalls:', recallsResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const allImages = imagesResult.data || [];
    const allRecalls = recallsResult.data || [];

    console.log(`Found ${allImages.length} images and ${allRecalls.length} recalls with embeddings`);

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

    // OPTIMIZATION: Calculate similarities in parallel batches
    const similarityStart = Date.now();
    
    const imageMatches = allImages.map((image: any) => ({
      id: image.id,
      recall_id: image.recall_id,
      ocr_text: image.ocr_text || '',
      image_explanation: image.image_explanation || '',
      similarity: calculateCosineSimilarity(image.recall_image_embedding),
      source: 'image'
    }));

    const recallMatches = allRecalls.map((recall: any) => ({
      id: recall.id,
      recall_id: recall.id,
      text: recall.text || '',
      location: recall.location || '',
      location_primary_type: recall.location_primary_type || '',
      similarity: calculateCosineSimilarity(recall.recall_embedding),
      source: 'recall'
    }));

    console.log(`Similarity calculations completed in ${Date.now() - similarityStart}ms`);

    // Combine all matches
    const allMatches = [...imageMatches, ...recallMatches];

    // Filter by >= 40% similarity (0.40 cosine similarity)
    const SIMILARITY_THRESHOLD = 0.40;
    const filteredMatches = allMatches.filter((match: any) => match.similarity >= SIMILARITY_THRESHOLD);

    // Sort by similarity (highest first)
    filteredMatches.sort((a: any, b: any) => b.similarity - a.similarity);

    console.log(`Found ${filteredMatches.length} matches with >= 40% similarity`);

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
      const { data: peopleRecalls } = await supabase
        .from('recalls')
        .select('id, text, location, location_primary_type')
        .in('id', peopleRecallIds)
        .eq('user_id', user.id);
      
      if (peopleRecalls && peopleRecalls.length > 0) {
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
        personInfo: matchedNames.length > 0 ? {
          detectedNames: detectedNames,
          matchedNames: matchedNames,
        } : null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: Use OpenAI gpt-4o-mini for question answering with source tracking
    console.log('Step 3: Using OpenAI gpt-4o-mini for question answering...');

    // OPTIMIZATION: Limit context to top 10 matches to reduce token usage
    const topMatches = uniqueRecallMatches.slice(0, 10);

    // Prepare context from matches with source IDs
    const contextWithSources = topMatches.map((match: any, idx: number) => {
      const sourceId = `SOURCE_${idx + 1}`;
      const priorityMarker = match.fromPeopleSearch ? ' [PRIORITY - Contains mentioned person]' : '';
      
      if (match.source === 'image') {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match${priorityMarker}):\nOCR: ${match.ocr_text}\nImage: ${match.image_explanation}`,
          similarity: match.similarity,
          fromPeopleSearch: match.fromPeopleSearch || false
        };
      } else {
        return {
          sourceId,
          recallId: match.recall_id,
          text: `${sourceId} (${Math.round(match.similarity * 100)}% match${priorityMarker}):\n${match.text}\nLocation: ${match.location}`,
          similarity: match.similarity,
          fromPeopleSearch: match.fromPeopleSearch || false
        };
      }
    });

    const context = contextWithSources.map((c: any) => c.text).join('\n\n');

    // OPTIMIZATION: Simplified prompt to reduce token usage
    const qaPrompt = `Answer the question using the provided recalls. Use bullet points for lists. If unsure, say so. Provide confidence (0-100).

IMPORTANT: Prioritize sources marked [PRIORITY - Contains mentioned person].

Question: ${query}

Recalls:
${context}

JSON format: {"answer": "your answer", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}`;

    console.log('Making request to OpenAI gpt-4o-mini...');
    const qaStart = Date.now();
    
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

    console.log(`OpenAI QA completed in ${Date.now() - qaStart}ms`);

    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('OpenAI QA API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to generate answer' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qaData = await qaResponse.json();
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
      personInfo: matchedNames.length > 0 ? {
        detectedNames: detectedNames,
        matchedNames: matchedNames,
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
