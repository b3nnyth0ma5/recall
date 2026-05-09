import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  recall: {
    id: string;
    text: string;
    location?: string;
    location_primary_type?: string;
    images?: Array<{
      id: string;
      ocr_text?: string;
      image_explanation?: string;
    }>;
  };
  user_question: string;
  chat_history?: ChatMessage[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== chat-with-recalls started ===', new Date().toISOString());

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { recall, user_question, chat_history = [] }: ChatRequest = await req.json();

    if (!recall?.id) {
      return new Response(JSON.stringify({ error: 'Recall data is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!user_question?.trim()) {
      return new Response(JSON.stringify({ error: 'User question is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Recall: ${recall.id} | Question: "${user_question}" | History: ${chat_history.length} messages`);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build system prompt with full recall context
    const systemParts: string[] = [
      'You are a helpful assistant answering questions about a specific personal memory recall.',
      '',
      '## Recall Details',
      `Text: ${recall.text || 'N/A'}`
    ];

    if (recall.location) systemParts.push(`Location: ${recall.location}`);
    if (recall.location_primary_type) systemParts.push(`Location Type: ${recall.location_primary_type}`);

    if (recall.images?.length) {
      systemParts.push(`\n## Images (${recall.images.length} total)`);
      for (let i = 0; i < recall.images.length; i++) {
        const img = recall.images[i];
        systemParts.push(`\nImage ${i + 1}:`);
        if (img.ocr_text) systemParts.push(`  OCR Text: ${img.ocr_text}`);
        if (img.image_explanation) systemParts.push(`  Explanation: ${img.image_explanation}`);
      }
    }

    systemParts.push(
      '',
      '## Instructions',
      '- Answer using the recall information above as your primary source',
      '- Be concise, helpful, and conversational',
      '- Use markdown formatting for readability',
      '- Do not ask follow-up questions'
    );

    const systemPrompt = systemParts.join('\n');

    // Build messages: system prompt + history (user/assistant only) + new question
    const apiMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...chat_history.filter(m => m.role === 'user' || m.role === 'assistant'),
      { role: 'user', content: user_question.trim() }
    ];

    console.log(`Calling gpt-4o with ${apiMessages.length} messages...`);

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1024,
        messages: apiMessages
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to generate answer', details: errorText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiData = await openaiResponse.json();
    const chatAnswer = openaiData.choices?.[0]?.message?.content || '';

    if (!chatAnswer) {
      return new Response(JSON.stringify({ error: 'Empty response from AI' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Answer generated (${chatAnswer.length} chars) | Saving to DB...`);

    // Save to recall_chats
    const { data: chatRecord, error: insertError } = await supabase
      .from('recall_chats')
      .insert({
        user_id: user.id,
        recall_id: recall.id,
        user_question: user_question.trim(),
        chat_answer: chatAnswer
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error saving chat:', insertError);
      return new Response(JSON.stringify({
        chat_answer: chatAnswer,
        chat_record_id: null,
        warning: 'Answer generated but not saved to database'
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const processingTime = Date.now() - startTime;
    console.log(`=== chat-with-recalls done in ${processingTime}ms ===`);

    return new Response(JSON.stringify({
      chat_answer: chatAnswer,
      chat_record_id: chatRecord.id,
      processing_time_ms: processingTime
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Error in chat-with-recalls:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      processing_time_ms: processingTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
