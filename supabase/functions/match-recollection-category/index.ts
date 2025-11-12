
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * Match Recollection Category Edge Function
 * 
 * This function:
 * 1. Receives a recall ID
 * 2. Fetches recall data (text, location, images with OCR and explanations)
 * 3. Fetches all categories from recollection_categories table
 * 4. Uses OpenAI to score relevance of each category (0-100)
 * 5. Updates recollections table with ALL matching categories if score >= 70
 * 6. Stores the match_score for each category match
 * 
 * Triggered by:
 * - OCR image processing completion
 * - Image deletion
 * - Note save/update
 */

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== Match Recollection Category Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { recallId } = requestBody;

    if (!recallId) {
      console.error('No recallId provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: recallId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Processing recall ID:', recallId);

    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Supabase credentials missing' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: OpenAI API key missing' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Step 1: Fetch recall data
    console.log('Fetching recall data...');
    const { data: recallData, error: recallError } = await supabase
      .from('recalls')
      .select('id, text, latitude, longitude, location, user_id')
      .eq('id', recallId)
      .single();

    if (recallError || !recallData) {
      console.error('Error fetching recall:', recallError);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch recall data',
          details: recallError?.message
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Recall data fetched:', {
      id: recallData.id,
      hasText: !!recallData.text,
      hasLocation: !!recallData.location,
      userId: recallData.user_id
    });

    // Step 2: Fetch recall images with OCR data
    console.log('Fetching recall images...');
    const { data: imagesData, error: imagesError } = await supabase
      .from('recall_images')
      .select('id, ocr_text, image_explanation')
      .eq('recall_id', recallId);

    if (imagesError) {
      console.error('Error fetching images:', imagesError);
      // Continue without images if there's an error
    }

    const images = imagesData || [];
    console.log(`Found ${images.length} images for recall`);

    // Step 3: Fetch all categories
    console.log('Fetching categories...');
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('recollection_categories')
      .select('id, category_name');

    if (categoriesError || !categoriesData || categoriesData.length === 0) {
      console.error('Error fetching categories or no categories found:', categoriesError);
      return new Response(
        JSON.stringify({
          error: 'No categories found in database',
          details: categoriesError?.message
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const categories = categoriesData;
    console.log(`Found ${categories.length} categories to match against`);

    // Step 4: Combine all text data for relevance scoring
    const textParts = [];

    if (recallData.text) {
      textParts.push(`Note text: ${recallData.text}`);
    }

    if (recallData.location) {
      textParts.push(`Location: ${recallData.location}`);
    }

    if (recallData.latitude && recallData.longitude) {
      textParts.push(`Coordinates: ${recallData.latitude}, ${recallData.longitude}`);
    }

    // Add OCR text and image explanations
    images.forEach((img, index) => {
      if (img.ocr_text) {
        textParts.push(`Image ${index + 1} text: ${img.ocr_text}`);
      }
      if (img.image_explanation) {
        textParts.push(`Image ${index + 1} description: ${img.image_explanation}`);
      }
    });

    const combinedText = textParts.join('\n\n');
    console.log('Combined text length:', combinedText.length);

    if (combinedText.trim().length === 0) {
      console.log('No content to categorize');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No content available for categorization',
          recallId
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Step 5: Score each category using OpenAI
    console.log('Scoring categories with OpenAI...');

    // Create a single prompt for all categories to optimize API calls
    const categoryNames = categories.map(c => c.category_name).join(', ');

    const systemPrompt = `You are a categorization expert. Your task is to score how relevant each category is to the given content. 

Provide scores from 0 to 100 where:
- 0-30: Not relevant or barely related
- 31-50: Somewhat related but not a good match
- 51-69: Related but not the best category
- 70-85: Good match, clearly relevant
- 86-100: Excellent match, highly relevant

Be strict with your scoring. Only give scores of 70+ when the content clearly belongs to that category.
A recall can match multiple categories if it's genuinely relevant to each.`;

    const userPrompt = `Score the relevance of each of these categories to the content below.

Categories: ${categoryNames}

Content:
${combinedText}

Respond with ONLY a JSON object mapping each category name to its score (0-100). Example format:
{
  "Food": 85,
  "Travel": 45,
  "Work": 10
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let openaiResponse;
    let retryCount = 0;
    const maxRetries = 2;

    // Retry logic for transient failures
    while (retryCount <= maxRetries) {
      try {
        openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: 'json_object' }
          })
        });

        if (openaiResponse.ok) {
          break;
        }

        if (openaiResponse.status === 429 && retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }

        break;
      } catch (fetchError) {
        console.error(`Fetch attempt ${retryCount + 1} failed:`, fetchError);
        if (retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
        } else {
          throw fetchError;
        }
      }
    }

    if (!openaiResponse || !openaiResponse.ok) {
      const errorText = await openaiResponse?.text() || 'No response';
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({
          error: 'OpenAI API request failed',
          details: errorText.substring(0, 200)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const openaiData = await openaiResponse.json();

    if (!openaiData.choices || openaiData.choices.length === 0) {
      console.error('No choices in OpenAI response');
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI API' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const responseText = openaiData.choices[0]?.message?.content || '{}';
    console.log('OpenAI response received:', responseText);

    // Parse the scores
    let scoresMap;
    try {
      scoresMap = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      return new Response(
        JSON.stringify({
          error: 'Failed to parse category scores',
          details: responseText.substring(0, 200)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Map scores to category IDs
    const categoryScores = categories.map(category => {
      const score = scoresMap[category.category_name] || 0;
      return {
        categoryId: category.id,
        categoryName: category.category_name,
        score: Math.max(0, Math.min(100, score))
      };
    });

    console.log('Category scores:', categoryScores);

    // Step 6: Find ALL matching categories (score >= 70)
    const matchingCategories = categoryScores.filter(cat => cat.score >= 70);
    
    console.log(`Found ${matchingCategories.length} matching categories (score >= 70):`, 
      matchingCategories.map(m => `${m.categoryName} (${m.score})`));

    // Step 7: Update recollections table with all matches
    if (matchingCategories.length > 0) {
      // First, delete existing recollections for this recall
      console.log('Deleting existing recollections for recall:', recallId);
      const { error: deleteError } = await supabase
        .from('recollections')
        .delete()
        .eq('recall_id', recallId)
        .eq('user_id', recallData.user_id);

      if (deleteError) {
        console.error('Error deleting existing recollections:', deleteError);
        return new Response(
          JSON.stringify({
            error: 'Failed to delete existing recollections',
            details: deleteError.message
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('Existing recollections deleted successfully');

      // Insert new recollections for all matching categories
      const recollectionsToInsert = matchingCategories.map(match => ({
        recall_id: recallId,
        user_id: recallData.user_id,
        category_id: match.categoryId,
        match_score: match.score
      }));

      console.log('Inserting new recollections:', recollectionsToInsert.length);
      const { error: insertError } = await supabase
        .from('recollections')
        .insert(recollectionsToInsert);

      if (insertError) {
        console.error('Error inserting recollections:', insertError);
        return new Response(
          JSON.stringify({
            error: 'Failed to create recollections',
            details: insertError.message
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('Recollections created successfully');
    } else {
      console.log('No categories matched with sufficient score (>= 70)');
      
      // Delete any existing recollections since nothing matches anymore
      console.log('Deleting existing recollections for recall:', recallId);
      const { error: deleteError } = await supabase
        .from('recollections')
        .delete()
        .eq('recall_id', recallId)
        .eq('user_id', recallData.user_id);

      if (deleteError) {
        console.error('Error deleting existing recollections:', deleteError);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log('=== Category matching completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    return new Response(
      JSON.stringify({
        success: true,
        recallId,
        matchCount: matchingCategories.length,
        matches: matchingCategories.map(m => ({
          categoryName: m.categoryName,
          score: m.score
        })),
        allScores: categoryScores,
        processingTimeMs: processingTime
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Match Recollection Category Function ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Processing time before error:', processingTime, 'ms');

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
