
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * Match Recollection Category Edge Function
 * 
 * This function supports two modes:
 * 
 * MODE 1: Match a recall against all categories (recallId provided)
 * 1. Receives a recall ID
 * 2. Fetches recall data (text, location, images with OCR and explanations)
 * 3. Fetches all categories from recollection_categories table
 * 4. Uses OpenAI to score relevance of each category (0-100)
 * 5. Updates recollections table with ALL matching categories if score >= 75
 * 6. Stores the match_score for each category match
 * 
 * MODE 2: Match a category against all recalls (categoryId provided)
 * 1. Receives a category ID
 * 2. Fetches category data (name, description)
 * 3. Fetches all recalls for the user
 * 4. Uses OpenAI to score relevance of each recall (0-100)
 * 5. Updates recollections table with ALL matching recalls if score >= 75
 * 6. Stores the match_score for each recall match
 * 
 * Triggered by:
 * - OCR image processing completion
 * - Image deletion
 * - Note save/update
 * - Category creation/update
 */

// Helper function to sanitize text for JSON
function sanitizeTextForJSON(text: string): string {
  if (!text) return '';
  
  // Replace problematic characters
  return text
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/"/g, '\\"')    // Escape double quotes
    .replace(/\n/g, '\\n')   // Escape newlines
    .replace(/\r/g, '\\r')   // Escape carriage returns
    .replace(/\t/g, '\\t')   // Escape tabs
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control characters
}

// Helper function to truncate text to prevent token limits
function truncateText(text: string, maxLength: number = 2000): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Helper function to safely parse OpenAI response
function safeParseJSON(responseText: string): any {
  try {
    // First, try direct parsing
    return JSON.parse(responseText);
  } catch (firstError) {
    console.log('First parse attempt failed, trying to clean response...');
    
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      
      // Try to find JSON object in the response
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }
      
      throw new Error('Could not extract valid JSON from response');
    } catch (secondError) {
      console.error('Failed to parse OpenAI response after cleanup:', secondError);
      console.error('Raw response text:', responseText.substring(0, 500));
      throw new Error(`Failed to parse OpenAI response: ${secondError instanceof Error ? secondError.message : 'Unknown error'}`);
    }
  }
}

// Helper function to match a recall against all categories
async function matchRecallAgainstCategories(
  recallId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  openaiApiKey: string,
  corsHeaders: Record<string, string>,
  startTime: number
): Promise<Response> {
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
    .select('id, text, location, location_primary_type, user_id, latitude, longitude')
    .eq('id', recallId)
    .single();

  if (recallError || !recallData) {
    console.error('Error fetching recall:', recallError);
    return new Response(JSON.stringify({
      error: 'Failed to fetch recall data',
      details: recallError?.message
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
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

  // Step 3: Fetch all categories for this user
  console.log('Fetching categories...');
  const { data: categoriesData, error: categoriesError } = await supabase
    .from('recollection_categories')
    .select('id, category_name, category_search_description')
    .eq('user_id', recallData.user_id);

  if (categoriesError || !categoriesData || categoriesData.length === 0) {
    console.error('Error fetching categories or no categories found:', categoriesError);
    return new Response(JSON.stringify({
      success: true,
      message: 'No categories found for user',
      recallId
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const categories = categoriesData;
  console.log(`Found ${categories.length} categories to match against`);

  // Step 4: Combine all text data for relevance scoring
  const textParts = [];
  if (recallData.text) {
    textParts.push(`Note text: ${sanitizeTextForJSON(recallData.text)}`);
  }
  if (recallData.location) {
    textParts.push(`Location: ${sanitizeTextForJSON(recallData.location)}`);
  }
  if (recallData.location_primary_type) {
    textParts.push(`Location Type: ${sanitizeTextForJSON(recallData.location_primary_type)}`);
  }

  // Add OCR text and image explanations
  images.forEach((img, index) => {
    if (img.ocr_text) {
      textParts.push(`Image ${index + 1} text: ${sanitizeTextForJSON(img.ocr_text)}`);
    }
    if (img.image_explanation) {
      textParts.push(`Image ${index + 1} description: ${sanitizeTextForJSON(img.image_explanation)}`);
    }
  });

  const combinedText = truncateText(textParts.join('\n\n'), 3000);
  console.log('Combined text length:', combinedText.length);

  if (combinedText.trim().length === 0) {
    console.log('No content to categorize');
    return new Response(JSON.stringify({
      success: true,
      message: 'No content available for categorization',
      recallId
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Step 5: Score each category using OpenAI
  console.log('Scoring categories with OpenAI...');
  
  // Create a prompt with category descriptions
  const categoryDescriptions = categories.map(c => 
    `${sanitizeTextForJSON(c.category_name)}: ${sanitizeTextForJSON(c.category_search_description)}`
  ).join('\n');

  const systemPrompt = `You are a categorization expert. Your task is to score how relevant each category is to the given content. Provide scores from 0 to 100 where:
0-30: Not relevant or barely related
31-50: Somewhat related but not a good match
51-69: Related but not the best category
70-85: Good match, clearly relevant
86-100: Excellent match, highly relevant

Be strict with your scoring. Only give scores of 70+ when the content clearly belongs to that category. A recall can match multiple categories if it is genuinely relevant to each.`;

  const userPrompt = `Score the relevance of each of these categories to the content below. 

Categories:
${categoryDescriptions}

Content:
${combinedText}

Respond with ONLY a valid JSON object mapping each category name to its score (0-100). Do not include any markdown formatting or code blocks.
Example format:
{"Food": 85, "Travel": 45, "Work": 10}`;

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: userPrompt
    }
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
          temperature: 0.2,
          max_tokens: 500,
          response_format: {
            type: 'json_object'
          }
        })
      });

      if (openaiResponse.ok) {
        break;
      }

      if (openaiResponse.status === 429 && retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }

      break;
    } catch (fetchError) {
      console.error(`Fetch attempt ${retryCount + 1} failed:`, fetchError);
      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        retryCount++;
      } else {
        throw fetchError;
      }
    }
  }

  if (!openaiResponse || !openaiResponse.ok) {
    const errorText = await openaiResponse?.text() || 'No response';
    console.error('OpenAI API error:', errorText);
    return new Response(JSON.stringify({
      error: 'OpenAI API request failed',
      details: errorText.substring(0, 200)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const openaiData = await openaiResponse.json();
  if (!openaiData.choices || openaiData.choices.length === 0) {
    console.error('No choices in OpenAI response');
    return new Response(JSON.stringify({
      error: 'Invalid response from OpenAI API'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const responseText = openaiData.choices[0]?.message?.content || '{}';
  console.log('OpenAI response received (first 200 chars):', responseText.substring(0, 200));

  // Parse the scores with safe parsing
  let scoresMap;
  try {
    scoresMap = safeParseJSON(responseText);
  } catch (parseError) {
    console.error('Failed to parse OpenAI response as JSON:', parseError);
    console.error('Full response text:', responseText);
    return new Response(JSON.stringify({
      error: 'Failed to parse category scores',
      details: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
      rawResponse: responseText.substring(0, 500)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Map scores to category IDs
  const categoryScores = categories.map((category) => {
    const score = scoresMap[category.category_name] || 0;
    return {
      categoryId: category.id,
      categoryName: category.category_name,
      score: Math.max(0, Math.min(100, score))
    };
  });

  console.log('Category scores:', categoryScores);

  // Step 6: Find ALL matching categories (score >= 75)
  const matchingCategories = categoryScores.filter((cat) => cat.score >= 75);
  console.log(`Found ${matchingCategories.length} matching categories (score >= 75):`, 
    matchingCategories.map((m) => `${m.categoryName} (${m.score})`));

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
      return new Response(JSON.stringify({
        error: 'Failed to delete existing recollections',
        details: deleteError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('Existing recollections deleted successfully');

    // Insert new recollections for all matching categories
    const recollectionsToInsert = matchingCategories.map((match) => ({
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
      return new Response(JSON.stringify({
        error: 'Failed to create recollections',
        details: insertError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('Recollections created successfully');
  } else {
    console.log('No categories matched with sufficient score (>= 75)');
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

  return new Response(JSON.stringify({
    success: true,
    recallId,
    matchCount: matchingCategories.length,
    matches: matchingCategories.map((m) => ({
      categoryName: m.categoryName,
      score: m.score
    })),
    allScores: categoryScores,
    processingTimeMs: processingTime
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

// Helper function to match a category against all recalls
async function matchCategoryAgainstRecalls(
  categoryId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  openaiApiKey: string,
  corsHeaders: Record<string, string>,
  startTime: number
): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Step 1: Fetch category data
  console.log('Fetching category data...');
  const { data: categoryData, error: categoryError } = await supabase
    .from('recollection_categories')
    .select('id, category_name, category_search_description, user_id')
    .eq('id', categoryId)
    .single();

  if (categoryError || !categoryData) {
    console.error('Error fetching category:', categoryError);
    return new Response(JSON.stringify({
      error: 'Failed to fetch category data',
      details: categoryError?.message
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  console.log('Category data fetched:', {
    id: categoryData.id,
    name: categoryData.category_name,
    userId: categoryData.user_id
  });

  // Step 2: Fetch all recalls for this user
  console.log('Fetching all recalls for user...');
  const { data: recallsData, error: recallsError } = await supabase
    .from('recalls')
    .select('id, text, location, location_primary_type, latitude, longitude')
    .eq('user_id', categoryData.user_id);

  if (recallsError || !recallsData || recallsData.length === 0) {
    console.error('Error fetching recalls or no recalls found:', recallsError);
    return new Response(JSON.stringify({
      success: true,
      message: 'No recalls found for user',
      categoryId
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  console.log(`Found ${recallsData.length} recalls to match against`);

  // Step 3: For each recall, fetch images and build content
  const recallsWithContent = await Promise.all(
    recallsData.map(async (recall) => {
      const { data: imagesData } = await supabase
        .from('recall_images')
        .select('id, ocr_text, image_explanation')
        .eq('recall_id', recall.id);

      const images = imagesData || [];
      
      const textParts = [];
      if (recall.text) {
        textParts.push(`Note text: ${sanitizeTextForJSON(recall.text)}`);
      }
      if (recall.location) {
        textParts.push(`Location: ${sanitizeTextForJSON(recall.location)}`);
      }
      if (recall.location_primary_type) {
        textParts.push(`Location Type: ${sanitizeTextForJSON(recall.location_primary_type)}`);
      }

      images.forEach((img, index) => {
        if (img.ocr_text) {
          textParts.push(`Image ${index + 1} text: ${sanitizeTextForJSON(img.ocr_text)}`);
        }
        if (img.image_explanation) {
          textParts.push(`Image ${index + 1} description: ${sanitizeTextForJSON(img.image_explanation)}`);
        }
      });

      return {
        id: recall.id,
        content: truncateText(textParts.join('\n\n'), 1000)
      };
    })
  );

  // Filter out recalls with no content
  const validRecalls = recallsWithContent.filter(r => r.content.trim().length > 0);
  console.log(`${validRecalls.length} recalls have content to match`);

  if (validRecalls.length === 0) {
    console.log('No recalls with content to match');
    return new Response(JSON.stringify({
      success: true,
      message: 'No recalls with content to match',
      categoryId
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Step 4: Score each recall using OpenAI
  console.log('Scoring recalls with OpenAI...');
  
  // Build a prompt with all recalls
  const recallsText = validRecalls.map((r, idx) => 
    `Recall ${idx + 1} (ID: ${r.id}):\n${r.content}`
  ).join('\n\n---\n\n');

  const systemPrompt = `You are a categorization expert. Your task is to score how relevant each recall is to the given category. Provide scores from 0 to 100 where:
0-30: Not relevant or barely related
31-50: Somewhat related but not a good match
51-69: Related but not the best category
70-85: Good match, clearly relevant
86-100: Excellent match, highly relevant

Be strict with your scoring. Only give scores of 70+ when the recall clearly belongs to this category.`;

  const userPrompt = `Score the relevance of each recall to this category:

Category: ${sanitizeTextForJSON(categoryData.category_name)}
Description: ${sanitizeTextForJSON(categoryData.category_search_description)}

Recalls:
${recallsText}

Respond with ONLY a valid JSON object mapping each recall ID to its score (0-100). Do not include any markdown formatting or code blocks.
Example format:
{"recall-id-1": 85, "recall-id-2": 45, "recall-id-3": 10}`;

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: userPrompt
    }
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
          temperature: 0.2,
          max_tokens: 1000,
          response_format: {
            type: 'json_object'
          }
        })
      });

      if (openaiResponse.ok) {
        break;
      }

      if (openaiResponse.status === 429 && retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }

      break;
    } catch (fetchError) {
      console.error(`Fetch attempt ${retryCount + 1} failed:`, fetchError);
      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        retryCount++;
      } else {
        throw fetchError;
      }
    }
  }

  if (!openaiResponse || !openaiResponse.ok) {
    const errorText = await openaiResponse?.text() || 'No response';
    console.error('OpenAI API error:', errorText);
    return new Response(JSON.stringify({
      error: 'OpenAI API request failed',
      details: errorText.substring(0, 200)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const openaiData = await openaiResponse.json();
  if (!openaiData.choices || openaiData.choices.length === 0) {
    console.error('No choices in OpenAI response');
    return new Response(JSON.stringify({
      error: 'Invalid response from OpenAI API'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const responseText = openaiData.choices[0]?.message?.content || '{}';
  console.log('OpenAI response received (first 200 chars):', responseText.substring(0, 200));

  // Parse the scores with safe parsing
  let scoresMap;
  try {
    scoresMap = safeParseJSON(responseText);
  } catch (parseError) {
    console.error('Failed to parse OpenAI response as JSON:', parseError);
    console.error('Full response text:', responseText);
    return new Response(JSON.stringify({
      error: 'Failed to parse recall scores',
      details: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
      rawResponse: responseText.substring(0, 500)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Map scores to recall IDs
  const recallScores = validRecalls.map((recall) => {
    const score = scoresMap[recall.id] || 0;
    return {
      recallId: recall.id,
      score: Math.max(0, Math.min(100, score))
    };
  });

  console.log('Recall scores:', recallScores);

  // Step 5: Find ALL matching recalls (score >= 75)
  const matchingRecalls = recallScores.filter((r) => r.score >= 75);
  console.log(`Found ${matchingRecalls.length} matching recalls (score >= 75)`);

  // Step 6: Update recollections table with all matches
  if (matchingRecalls.length > 0) {
    // First, delete existing recollections for this category
    console.log('Deleting existing recollections for category:', categoryId);
    const { error: deleteError } = await supabase
      .from('recollections')
      .delete()
      .eq('category_id', categoryId)
      .eq('user_id', categoryData.user_id);

    if (deleteError) {
      console.error('Error deleting existing recollections:', deleteError);
      return new Response(JSON.stringify({
        error: 'Failed to delete existing recollections',
        details: deleteError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('Existing recollections deleted successfully');

    // Insert new recollections for all matching recalls
    const recollectionsToInsert = matchingRecalls.map((match) => ({
      recall_id: match.recallId,
      user_id: categoryData.user_id,
      category_id: categoryId,
      match_score: match.score
    }));

    console.log('Inserting new recollections:', recollectionsToInsert.length);
    const { error: insertError } = await supabase
      .from('recollections')
      .insert(recollectionsToInsert);

    if (insertError) {
      console.error('Error inserting recollections:', insertError);
      return new Response(JSON.stringify({
        error: 'Failed to create recollections',
        details: insertError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('Recollections created successfully');
  } else {
    console.log('No recalls matched with sufficient score (>= 75)');
    // Delete any existing recollections since nothing matches anymore
    console.log('Deleting existing recollections for category:', categoryId);
    const { error: deleteError } = await supabase
      .from('recollections')
      .delete()
      .eq('category_id', categoryId)
      .eq('user_id', categoryData.user_id);

    if (deleteError) {
      console.error('Error deleting existing recollections:', deleteError);
    }
  }

  const processingTime = Date.now() - startTime;
  console.log('=== Category matching completed successfully ===');
  console.log('Total processing time:', processingTime, 'ms');

  return new Response(JSON.stringify({
    success: true,
    categoryId,
    matchCount: matchingRecalls.length,
    matches: matchingRecalls.map((m) => ({
      recallId: m.recallId,
      score: m.score
    })),
    allScores: recallScores,
    processingTimeMs: processingTime
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  const startTime = Date.now();
  console.log('=== Match Recollection Category Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(JSON.stringify({
        error: 'Server configuration error: Supabase credentials missing'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(JSON.stringify({
        error: 'Server configuration error: OpenAI API key missing'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(JSON.stringify({
        error: 'Invalid JSON in request body'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const { recallId, categoryId, mode } = requestBody;

    // Determine which mode we're in
    if (mode === 'category' && categoryId) {
      console.log('Mode: Match category against all recalls');
      console.log('Category ID:', categoryId);
      return await matchCategoryAgainstRecalls(
        categoryId,
        supabaseUrl,
        supabaseServiceKey,
        openaiApiKey,
        corsHeaders,
        startTime
      );
    } else if (recallId) {
      console.log('Mode: Match recall against all categories');
      console.log('Recall ID:', recallId);
      return await matchRecallAgainstCategories(
        recallId,
        supabaseUrl,
        supabaseServiceKey,
        openaiApiKey,
        corsHeaders,
        startTime
      );
    } else {
      console.error('No recallId or categoryId provided in request');
      return new Response(JSON.stringify({
        error: 'Missing required field: recallId or categoryId with mode'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Match Recollection Category Function ===');
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
