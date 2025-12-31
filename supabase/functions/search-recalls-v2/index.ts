
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface Recall {
  recall_id: string;
  matchPercentage: number;
  tier?: string;
  recall_data?: any;
  images_data?: any[];
  isLocationMatch?: boolean;
  isPeopleMatch?: boolean;
  isKeywordMatch?: boolean;
  keywordMatches?: number;
  totalKeywords?: number;
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
    const { query, locationRecalls, peopleRecalls, keywordRecalls, personInfo } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Search query:', query);
    console.log('Location recalls:', locationRecalls ? `${locationRecalls.length} recalls` : 'None');
    console.log('People recalls:', peopleRecalls ? `${peopleRecalls.length} recalls` : 'None');
    console.log('Keyword recalls:', keywordRecalls ? `${keywordRecalls.length} recalls` : 'None');

    // Combine all recalls and deduplicate by recall_id
    const allRecallsMap = new Map<string, Recall>();
    
    // Add location recalls
    if (locationRecalls && Array.isArray(locationRecalls)) {
      locationRecalls.forEach((recall: Recall) => {
        allRecallsMap.set(recall.recall_id, {
          ...recall,
          matchPercentage: recall.matchPercentage || 100,
          isLocationMatch: true,
          isPeopleMatch: false,
          isKeywordMatch: false
        });
      });
    }
    
    // Add people recalls
    if (peopleRecalls && Array.isArray(peopleRecalls)) {
      peopleRecalls.forEach((recall: Recall) => {
        if (allRecallsMap.has(recall.recall_id)) {
          const existing = allRecallsMap.get(recall.recall_id)!;
          allRecallsMap.set(recall.recall_id, {
            ...existing,
            isPeopleMatch: true
          });
        } else {
          allRecallsMap.set(recall.recall_id, {
            ...recall,
            matchPercentage: recall.matchPercentage || 100,
            isLocationMatch: false,
            isPeopleMatch: true,
            isKeywordMatch: false
          });
        }
      });
    }
    
    // Add keyword recalls
    if (keywordRecalls && Array.isArray(keywordRecalls)) {
      keywordRecalls.forEach((recall: Recall) => {
        if (allRecallsMap.has(recall.recall_id)) {
          const existing = allRecallsMap.get(recall.recall_id)!;
          allRecallsMap.set(recall.recall_id, {
            ...existing,
            isKeywordMatch: true
          });
        } else {
          allRecallsMap.set(recall.recall_id, {
            ...recall,
            matchPercentage: recall.matchPercentage || 0,
            isLocationMatch: false,
            isPeopleMatch: false,
            isKeywordMatch: true
          });
        }
      });
    }

    const allRecalls = Array.from(allRecallsMap.values());
    console.log(`Combined ${allRecalls.length} unique recalls from all sources`);

    if (allRecalls.length === 0) {
      console.log('No recalls to process');
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

    // Sort recalls by match percentage (highest first)
    console.log('Sorting recalls by match percentage (highest first)...');
    allRecalls.sort((a, b) => {
      const matchA = a.matchPercentage || 0;
      const matchB = b.matchPercentage || 0;
      
      if (matchA !== matchB) {
        return matchB - matchA; // Higher match percentage first
      }
      
      // If match percentages are equal, sort by recency
      const dateA = a.recall_data?.created_at ? new Date(a.recall_data.created_at).getTime() : 0;
      const dateB = b.recall_data?.created_at ? new Date(b.recall_data.created_at).getTime() : 0;
      return dateB - dateA; // Most recent first
    });
    
    console.log('Top 5 recalls after sorting:');
    allRecalls.slice(0, 5).forEach((recall: Recall, idx: number) => {
      console.log(`  ${idx + 1}. Match: ${Math.round(recall.matchPercentage || 0)}%, Created: ${recall.recall_data?.created_at || 'N/A'}`);
    });

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use the highest matching recalls for answering (prioritize top matches)
    // Build comprehensive context including all images from highest matching recalls
    console.log('Building context from highest matching recalls...');
    
    const contextWithSources = allRecalls.map((recall: Recall, idx: number) => {
      const sourceId = `SOURCE_${idx + 1}`;
      
      // Build match type indicators
      const matchTypes: string[] = [];
      if (recall.isLocationMatch) matchTypes.push('LOCATION');
      if (recall.isPeopleMatch) matchTypes.push('PEOPLE');
      if (recall.isKeywordMatch) matchTypes.push('KEYWORD');
      const matchTypeStr = matchTypes.length > 0 ? ` [${matchTypes.join(' + ')}]` : '';
      
      const tierMarker = recall.tier ? ` [${recall.tier} TIER]` : '';
      const keywordMarker = recall.keywordMatches && recall.totalKeywords 
        ? ` [${recall.keywordMatches}/${recall.totalKeywords} keywords matched]` 
        : '';
      
      let contextText = `${sourceId} (${Math.round(recall.matchPercentage || 0)}% match${matchTypeStr}${tierMarker}${keywordMarker}):\n`;
      contextText += `Text: ${recall.recall_data?.text || ''}\n`;
      contextText += `Location: ${recall.recall_data?.location || ''}\n`;
      contextText += `Location Type: ${recall.recall_data?.location_primary_type || ''}\n`;
      
      // Include ALL images with their information
      if (recall.images_data && recall.images_data.length > 0) {
        contextText += `Images (${recall.images_data.length}):\n`;
        recall.images_data.forEach((img: any, imgIdx: number) => {
          contextText += `  Image ${imgIdx + 1} (${Math.round(img.similarity * 100)}% match):\n`;
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
        text: contextText,
        matchPercentage: recall.matchPercentage || 0,
        tier: recall.tier || 'MEDIUM',
        isLocationMatch: recall.isLocationMatch || false,
        isPeopleMatch: recall.isPeopleMatch || false,
        isKeywordMatch: recall.isKeywordMatch || false
      };
    });

    const context = contextWithSources.map(c => c.text).join('\n');

    // Log the context being passed to OpenAI
    console.log('=== CONTEXT BEING PASSED TO OPENAI ===');
    console.log(context);
    console.log('=== END OF CONTEXT ===');

    // Generate answer using OpenAI with temperature 0.3 and max_tokens 700
    console.log('Generating answer with OpenAI (temperature: 0.3, max_tokens: 700)...');
    
    const qaPrompt = `You are an intelligent search assistant that answers complex, composite questions based on the provided information. You understand the user's intent and make associations between pieces of information that the user would've expected to make. You also understand the context of the search query.

CRITICAL RULES:
- Prioritize your answer based on the recalls with the highest match percentages
- Use bullet points when listing multiple items
- Provide a confidence score (0-100) based on how well the recalls answer the question
- Research the answer thoroughly based on the provided information

MATCH INFORMATION:
- Pay attention to match type indicators: [LOCATION], [PEOPLE], [KEYWORD]
- Pay attention to TIER markers: [HIGH], [MEDIUM], [LOW]
- Pay attention to keyword match counts - more matched keywords indicate better relevance

Question: ${query}

Available Recalls (sorted by highest match percentage first):
${context}

Provide your answer in JSON format: {"answer": "your comprehensive answer based on the highest matching recalls including images", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}.
If the recalls don't contain the requested information, respond with: {"answer": "I don't have enough information in the provided recalls to answer this question.", "confidence": 0, "sources": []}.`;

    console.log('Making request to OpenAI gpt-4o-mini...');
    const qaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        //model: 'gpt-4o-mini',
        model: 'gpt-5-mini',

        messages: [
          {
            role: 'user',
            content: qaPrompt
          }
        ],
        //temperature: 0.3,
        //max_tokens: 700,
        reasoning_effort: 'minimal', // e.g., 'minimal', 'low', 'medium', 'high'
        verbosity: 'low', // e.g., 'low', 'medium', 'high'
        response_format: { type: 'json_object' }
      })
    });

    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('OpenAI QA API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to generate answer', details: errorText }), {
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
        const source = contextWithSources.find(c => c.sourceId === sourceId);
        return source ? source.recallId : null;
      })
      .filter((id: string | null) => id !== null);

    console.log('Recall IDs used for answer:', sourceRecallIds);

    // Return recalls in order of highest % match first (those used to answer the question)
    // Used recalls come first (in order of match %), then unused recalls (in order of match %)
    const usedRecalls = allRecalls.filter((recall: Recall) => sourceRecallIds.includes(recall.recall_id));
    const unusedRecalls = allRecalls.filter((recall: Recall) => !sourceRecallIds.includes(recall.recall_id));
    
    // Sort used recalls by match percentage (highest first)
    usedRecalls.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
    
    // Sort unused recalls by match percentage (highest first)
    unusedRecalls.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
    
    const orderedRecalls = [...usedRecalls, ...unusedRecalls];

    console.log(`Ordered results: ${usedRecalls.length} used for answer (highest % match first), ${unusedRecalls.length} others (highest % match first)`);

    // Convert to result format
    const matchResults = orderedRecalls.map((recall: Recall) => ({
      id: recall.recall_id,
      matchPercentage: Math.round(recall.matchPercentage || 0),
      usedForAnswer: sourceRecallIds.includes(recall.recall_id),
      tier: recall.tier || 'MEDIUM',
      keywordMatches: recall.keywordMatches || 0,
      totalKeywords: recall.totalKeywords || 0,
      isLocationMatch: recall.isLocationMatch || false,
      isPeopleMatch: recall.isPeopleMatch || false,
      isKeywordMatch: recall.isKeywordMatch || false
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
