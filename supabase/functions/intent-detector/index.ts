import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface IntentDetectorRequest {
  text: string;
}

interface IntentDetectorResponse {
  intent: 'create' | 'search' | 'unknown';
  confidence: number;
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
  console.log('=== Intent Detector Edge Function Started ===');
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
    const { text } = await req.json() as IntentDetectorRequest;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Text parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Analyzing text for intent:', text);

    // Get Claude API key
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use Claude claude-haiku-4-5 to detect intent
    console.log('Calling Claude claude-haiku-4-5 for intent detection...');
    
    const systemPrompt = `You are an intent classifier for a recall/memory app. Your job is to determine if the user wants to:
1. CREATE a new recall/memory (storing information for later)
2. SEARCH for existing recalls/memories (retrieving information)
3. UNKNOWN if you cannot determine with high confidence

GUIDELINES:
- CREATE intent: User is sharing information, noting something down, or wants to remember something
  Examples: "Had lunch at Joe's Cafe", "Meeting with Sarah tomorrow", "Password is abc123", "Great movie tonight"
  
- SEARCH intent: User is asking questions, looking for information, or trying to find something
  Examples: "Where did I have lunch?", "Find recalls about Sarah", "Show me movie recalls"
  
- UNKNOWN: Ambiguous cases or very short/unclear text

Respond ONLY with valid JSON in this exact format:
{"intent": "create" | "search" | "unknown", "confidence": 0-100}

Be decisive - only use "unknown" if truly ambiguous. Confidence should be 70+ for clear cases.`;

    const qaResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('Claude API error:', errorText);
      console.error('Response status:', qaResponse.status);
      return new Response(JSON.stringify({ error: 'Failed to detect intent', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qaData = await qaResponse.json();
    console.log('Claude response received:', JSON.stringify(qaData, null, 2));
    
    const qaContent = qaData.content?.[0]?.text;

    let intent: 'create' | 'search' | 'unknown' = 'unknown';
    let confidence = 0;

    if (qaContent) {
      try {
        const parsed = JSON.parse(qaContent);
        intent = parsed.intent || 'unknown';
        confidence = parsed.confidence || 0;
        
        console.log('Intent detected:', intent);
        console.log('Confidence:', confidence);
      } catch (parseError) {
        console.error('Failed to parse Claude response:', parseError);
        console.error('Raw content:', qaContent);
        // Default to unknown on parse error
        intent = 'unknown';
        confidence = 0;
      }
    }

    const processingTime = Date.now() - startTime;
    console.log('=== Intent Detector completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    const response: IntentDetectorResponse = {
      intent,
      confidence,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Intent Detector Edge Function ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Processing time before error:', processingTime, 'ms');

    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
