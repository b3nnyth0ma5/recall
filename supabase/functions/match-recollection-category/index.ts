
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * Match Recollection Category Edge Function (Embedding-Based)
 * 
 * This function uses vector embeddings for intelligent category matching:
 * - Uses recalls.recall_embedding for text-based recall matching
 * - Uses recall_images.recall_image_embedding for image-based recall matching
 * - Combines embeddings using cosine similarity for accurate matching
 * 
 * MODE 1: Match a recall against all categories (recallId provided)
 * 1. Receives a recall ID
 * 2. Fetches recall embedding and image embeddings
 * 3. Fetches all categories with their descriptions
 * 4. Generates category embeddings on-the-fly
 * 5. Calculates cosine similarity between recall/images and categories
 * 6. Updates recollections table with matches (similarity >= 0.75)
 * 
 * MODE 2: Match a category against all recalls (categoryId provided)
 * 1. Receives a category ID
 * 2. Generates category embedding from name + description
 * 3. Fetches all recalls with their embeddings
 * 4. Calculates cosine similarity for each recall
 * 5. Updates recollections table with matches (similarity >= 0.75)
 */

// Helper function to generate embedding using OpenAI
async function generateEmbedding(text: string, openaiApiKey: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.trim()
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding API error: ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

// Helper function to match a recall against all categories using embeddings
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

  // Step 1: Fetch recall data with embedding
  console.log('Fetching recall data with embedding...');
  const { data: recallData, error: recallError } = await supabase
    .from('recalls')
    .select('id, text, recall_embedding, user_id')
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
    hasEmbedding: !!recallData.recall_embedding,
    userId: recallData.user_id
  });

  // Step 2: Fetch recall images with embeddings
  console.log('Fetching recall images with embeddings...');
  const { data: imagesData, error: imagesError } = await supabase
    .from('recall_images')
    .select('id, recall_image_embedding')
    .eq('recall_id', recallId);

  if (imagesError) {
    console.error('Error fetching images:', imagesError);
  }

  const images = imagesData || [];
  const imageEmbeddings = images
    .filter(img => img.recall_image_embedding)
    .map(img => img.recall_image_embedding);
  
  console.log(`Found ${images.length} images, ${imageEmbeddings.length} with embeddings`);

  // Check if we have any embeddings to work with
  if (!recallData.recall_embedding && imageEmbeddings.length === 0) {
    console.log('No embeddings available for recall');
    return new Response(JSON.stringify({
      success: true,
      message: 'No embeddings available for recall',
      recallId
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

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

  // Step 4: Generate embeddings for each category
  console.log('Generating category embeddings...');
  const categoryEmbeddings = await Promise.all(
    categories.map(async (category) => {
      try {
        const categoryText = `${category.category_name}: ${category.category_search_description}`;
        const embedding = await generateEmbedding(categoryText, openaiApiKey);
        return {
          categoryId: category.id,
          categoryName: category.category_name,
          embedding
        };
      } catch (error) {
        console.error(`Error generating embedding for category ${category.id}:`, error);
        return null;
      }
    })
  );

  const validCategoryEmbeddings = categoryEmbeddings.filter(ce => ce !== null);
  console.log(`Generated ${validCategoryEmbeddings.length} category embeddings`);

  if (validCategoryEmbeddings.length === 0) {
    console.error('Failed to generate any category embeddings');
    return new Response(JSON.stringify({
      error: 'Failed to generate category embeddings'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Step 5: Calculate similarity scores
  console.log('Calculating similarity scores...');
  const categoryScores = validCategoryEmbeddings.map((catEmbed) => {
    let maxSimilarity = 0;

    // Compare with recall text embedding
    if (recallData.recall_embedding) {
      const textSimilarity = cosineSimilarity(
        recallData.recall_embedding,
        catEmbed.embedding
      );
      maxSimilarity = Math.max(maxSimilarity, textSimilarity);
    }

    // Compare with image embeddings
    for (const imgEmbed of imageEmbeddings) {
      const imgSimilarity = cosineSimilarity(imgEmbed, catEmbed.embedding);
      maxSimilarity = Math.max(maxSimilarity, imgSimilarity);
    }

    // Convert similarity (0-1) to score (0-100)
    const score = Math.round(maxSimilarity * 100);

    return {
      categoryId: catEmbed.categoryId,
      categoryName: catEmbed.categoryName,
      score,
      similarity: maxSimilarity
    };
  });

  console.log('Category scores:', categoryScores);

  // Step 6: Find matching categories (score >= 60, which is similarity >= 0.75)
  const matchingCategories = categoryScores.filter((cat) => cat.score >= 75);
  console.log(`Found ${matchingCategories.length} matching categories (score >= 75):`, 
    matchingCategories.map((m) => `${m.categoryName} (${m.score})`));

  // Step 7: Update recollections table
  if (matchingCategories.length > 0) {
    // Delete existing recollections for this recall
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

    // Insert new recollections
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
    // Delete existing recollections
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
      score: m.score,
      similarity: m.similarity
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

// Helper function to match a category against all recalls using embeddings
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

  // Step 2: Generate category