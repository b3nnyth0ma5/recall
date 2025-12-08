
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface RecallData {
  id: string;
  text: string | null;
  recall_embedding: number[] | string | null;
  user_id: string;
  location: string | null;
  location_primary_type: string | null;
}

interface ImageData {
  id: string;
  recall_image_embedding: number[] | string | null;
  ocr_text: string | null;
  image_explanation: string | null;
}

interface RecallScore {
  recallId: string;
  recallText: string;
  location: string;
  locationType: string;
  similarity: number;
  matchSource: string;
  images: ImageData[];
}

interface RecallContext {
  recallId: string;
  actualId: string;
  similarity: number;
  contextText: string;
}

interface OpenAIMatch {
  recallId: string;
  confidence: number;
  reason: string;
}

interface FinalMatch {
  recallId: string;
  confidence: number;
  similarity: number;
  reason: string;
}

/**
 * New Category Matching Edge Function
 * 
 * This function is triggered when a new category is created.
 * It uses a two-step matching process:
 * 1. Embedding-based similarity search (>= 0.20 threshold) to find candidate recalls
 * 2. OpenAI API to identify which candidates are the closest matches
 * 
 * Process:
 * 1. Receives a category ID
 * 2. Generates category embedding from category_name + category_search_description using base64 encoding
 * 3. Finds all recalls with similarity >= 0.20 using embeddings
 * 4. Uses OpenAI to analyze and rank the candidate recalls
 * 5. Updates recollections table with high-confidence matches
 */

// Helper function to generate embedding using OpenAI with base64 encoding
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
      input: text.trim(),
      encoding_format: 'base64'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding API error: ${errorText}`);
  }

  const data = await response.json();
  const embeddingBase64 = data.data[0].embedding;
  
  // Decode base64 to get the actual embedding array
  const binaryString = atob(embeddingBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const float32Array = new Float32Array(bytes.buffer);
  const embedding = Array.from(float32Array);
  
  console.log('Decoded embedding array length:', embedding.length);
  
  return embedding;
}

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    console.log('Invalid vectors for cosine similarity:', {
      vecALength: vecA?.length,
      vecBLength: vecB?.length
    });
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
    console.log('Zero norm detected in cosine similarity');
    return 0;
  }

  const similarity = dotProduct / (normA * normB);
  return similarity;
}

// Helper function to parse stored embeddings (handles both array and string formats)
function parseStoredEmbedding(storedEmbedding: number[] | string | null): number[] | null {
  if (!storedEmbedding) {
    return null;
  }

  // If already an array, return it
  if (Array.isArray(storedEmbedding)) {
    return storedEmbedding;
  }

  // If it's a string, try to parse it
  if (typeof storedEmbedding === 'string') {
    try {
      const cleanStr = storedEmbedding.replace(/[\[\]]/g, '');
      const embeddingArray = cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
      return embeddingArray;
    } catch (error) {
      console.error('Failed to parse embedding string:', error);
      return null;
    }
  }

  return null;
}

// Helper function to sanitize and truncate text for OpenAI
function sanitizeText(text: string | null, maxLength: number = 500): string {
  if (!text) {
    return '';
  }
  
  // Remove excessive whitespace and newlines
  let sanitized = text.replace(/\s+/g, ' ').trim();
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== New Category Matching Edge Function Started ===');
    console.log('Request method:', req.method);
    console.log('Timestamp:', new Date().toISOString());

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      console.error('Missing required environment variables');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Parse request body
    const body = await req.json();
    console.log('Request body:', body);

    const { categoryId } = body;

    // Validate input
    if (!categoryId) {
      console.error('Missing required parameter: categoryId');
      return new Response(JSON.stringify({
        error: 'categoryId is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Step 1: Fetch category data
    console.log('Step 1: Fetching category data...');
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
      description: categoryData.category_search_description,
      userId: categoryData.user_id
    });

    // Step 2: Generate category embedding from category_name + category_search_description using base64
    console.log('Step 2: Generating category embedding from category_name + category_search_description with base64 encoding...');
    
    // Combine category_name and category_search_description for embedding
    const categoryName = categoryData.category_name || '';
    const categoryDescription = categoryData.category_search_description || '';
    const categoryText = `${categoryName}. ${categoryDescription}`.trim();
    
    if (!categoryText.trim()) {
      console.error('Category has empty name and description');
      return new Response(JSON.stringify({
        error: 'Category name and description are empty',
        details: 'Cannot generate embedding for empty category'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    let categoryEmbedding: number[];
    
    try {
      console.log(`Generating embedding for category using combined text: "${categoryText}"`);
      categoryEmbedding = await generateEmbedding(categoryText, openaiApiKey);
      console.log(`Generated category embedding, length: ${categoryEmbedding.length}`);
    } catch (error) {
      console.error('Error generating category embedding:', error);
      return new Response(JSON.stringify({
        error: 'Failed to generate category embedding',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Step 3: Fetch all recalls for this user with embeddings
    console.log('Step 3: Fetching recalls for user:', categoryData.user_id);
    const { data: recallsData, error: recallsError } = await supabase
      .from('recalls')
      .select('id, text, recall_embedding, user_id, location, location_primary_type')
      .eq('user_id', categoryData.user_id)
      .not('recall_embedding', 'is', null);

    if (recallsError) {
      console.error('Error fetching recalls:', recallsError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch recalls',
        details: recallsError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    if (!recallsData || recallsData.length === 0) {
      console.log('No recalls found for user');
      return new Response(JSON.stringify({
        success: true,
        message: 'No recalls found for user',
        categoryId,
        matchCount: 0
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log(`Found ${recallsData.length} recalls with embeddings`);

    // Step 4: Calculate similarity scores for each recall (text + images)
    console.log('Step 4: Calculating similarity scores for each recall...');
    const recallScores: RecallScore[] = await Promise.all(
      recallsData.map(async (recall: RecallData) => {
        let maxSimilarity = 0;
        let matchSource = 'none';

        // Compare with recall text embedding
        const recallEmbeddingArray = parseStoredEmbedding(recall.recall_embedding);
        if (recallEmbeddingArray && recallEmbeddingArray.length > 0) {
          const textSimilarity = cosineSimilarity(recallEmbeddingArray, categoryEmbedding);
          console.log(`Recall ${recall.id} text similarity: ${textSimilarity.toFixed(4)}`);
          if (textSimilarity > maxSimilarity) {
            maxSimilarity = textSimilarity;
            matchSource = 'text';
          }
        }

        // Fetch and compare with image embeddings
        const { data: imagesData, error: imagesError } = await supabase
          .from('recall_images')
          .select('id, recall_image_embedding, ocr_text, image_explanation')
          .eq('recall_id', recall.id)
          .not('recall_image_embedding', 'is', null);

        if (!imagesError && imagesData) {
          for (let i = 0; i < imagesData.length; i++) {
            const image = imagesData[i];
            const imageEmbeddingArray = parseStoredEmbedding(image.recall_image_embedding);
            if (imageEmbeddingArray && imageEmbeddingArray.length > 0) {
              const imgSimilarity = cosineSimilarity(imageEmbeddingArray, categoryEmbedding);
              console.log(`Recall ${recall.id} image ${i} similarity: ${imgSimilarity.toFixed(4)}`);
              if (imgSimilarity > maxSimilarity) {
                maxSimilarity = imgSimilarity;
                matchSource = `image_${i}`;
              }
            }
          }
        }

        return {
          recallId: recall.id,
          recallText: recall.text || '',
          location: recall.location || '',
          locationType: recall.location_primary_type || '',
          similarity: maxSimilarity,
          matchSource,
          images: imagesData || []
        };
      })
    );

    console.log('Calculated similarity scores for all recalls');

    // Step 5: Filter recalls with similarity >= 0.20
    const SIMILARITY_THRESHOLD = 0.20;
    const candidateRecalls = recallScores.filter((recall) => recall.similarity >= SIMILARITY_THRESHOLD);
    
    console.log(`Found ${candidateRecalls.length} candidate recalls with similarity >= ${SIMILARITY_THRESHOLD}`);

    if (candidateRecalls.length === 0) {
      console.log('No recalls matched with sufficient similarity (>= 0.20)');
      
      // Delete any existing recollections for this category
      const { error: deleteError } = await supabase
        .from('recollections')
        .delete()
        .eq('category_id', categoryId)
        .eq('user_id', categoryData.user_id);

      if (deleteError) {
        console.error('Error deleting existing recollections:', deleteError);
      }

      const processingTime = Date.now() - startTime;
      return new Response(JSON.stringify({
        success: true,
        categoryId,
        matchCount: 0,
        message: 'No recalls matched with sufficient similarity',
        processingTimeMs: processingTime
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Sort by similarity (highest first)
    candidateRecalls.sort((a, b) => b.similarity - a.similarity);

    // Step 6: Use OpenAI gpt-5-mini to analyze and rank the candidate recalls
    console.log('Step 6: Using OpenAI gpt-5-mini to analyze and rank candidate recalls...');

    // Prepare context for OpenAI with recall information including location
    const recallsContext: RecallContext[] = candidateRecalls.map((recall, idx) => {
      const recallId = `RECALL_${idx + 1}`;
      const similarity = Math.round(recall.similarity * 100);
      
      let contextText = `${recallId} (${similarity}% similarity):\nText: ${sanitizeText(recall.recallText, 300)}`;
      
      // Add location information if available
      if (recall.location) {
        contextText += `\nLocation: ${sanitizeText(recall.location, 100)}`;
        if (recall.locationType) {
          contextText += ` (${recall.locationType})`;
        }
      }
      
      // Add image information if available
      if (recall.images && recall.images.length > 0) {
        const imageInfo = recall.images
          .map((img: ImageData) => {
            const parts: string[] = [];
            if (img.ocr_text) {
              parts.push(`OCR: ${sanitizeText(img.ocr_text, 250)}`);
            }
            if (img.image_explanation) {
              parts.push(`Description: ${sanitizeText(img.image_explanation, 100)}`);
            }
            return parts.join(', ');
          })
          .filter((info: string) => info.length > 0)
          .join('; ');
        
        if (imageInfo) {
          contextText += `\nImages: ${imageInfo}`;
        }
      }
      
      return {
        recallId,
        actualId: recall.recallId,
        similarity: recall.similarity,
        contextText
      };
    });

    const context = recallsContext.map((r) => r.contextText).join('\n\n');

    const systemPrompt = `You are an expert at matching recalls to categories. You will be given a category description and a list of candidate recalls that have already been filtered by embedding similarity. Use the Category Description as a guide to understand what the user wants in the category.

Your task is to:
1. Analyze each recall to determine if it truly belongs to the category
2. Assign a confidence score (0-100) for each recall

A recall should only match if it clearly relates to the category description.`;

    const userPrompt = `Category: ${categoryData.category_name}
Category Description: ${categoryText}

Candidate Recalls:
${context}

Analyze each recall and provide your response in JSON format:
{
  "matches": [
    {"recallId": "RECALL_1", "confidence": 85, "reason": "brief explanation"},
    {"recallId": "RECALL_2", "confidence": 70, "reason": "brief explanation"}
  ]
}

Only include recalls with confidence >= 55. If no recalls meet this threshold, return an empty matches array.`;

    console.log('Making request to OpenAI gpt-5-mini...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        reasoning_effort: 'minimal',
        verbosity: 'low',
        response_format: { type: 'json_object' }
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      console.error('Response status:', openaiResponse.status);
      console.error('Response headers:', JSON.stringify(Object.fromEntries(openaiResponse.headers.entries())));
      return new Response(JSON.stringify({
        error: 'Failed to analyze recalls with OpenAI',
        details: errorText
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const openaiData = await openaiResponse.json();
    console.log('OpenAI response received:', JSON.stringify(openaiData, null, 2));
    const openaiContent = openaiData.choices?.[0]?.message?.content;

    let matches: OpenAIMatch[] = [];

    if (openaiContent) {
      try {
        const parsed = JSON.parse(openaiContent);
        matches = parsed.matches || [];
        console.log(`OpenAI identified ${matches.length} high-confidence matches`);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', parseError);
        console.error('OpenAI response content:', openaiContent);
        
        // Fallback: use all candidates with similarity-based scores
        matches = candidateRecalls.map((recall, idx) => ({
          recallId: `RECALL_${idx + 1}`,
          confidence: Math.round(recall.similarity * 100),
          reason: 'Fallback: based on embedding similarity'
        })).filter((m) => m.confidence >= 60);
        
        console.log(`Using fallback: ${matches.length} matches based on similarity`);
      }
    }

    // Map recall IDs back to actual recall IDs
    const finalMatches: FinalMatch[] = matches
      .map((match) => {
        const recallContext = recallsContext.find((r) => r.recallId === match.recallId);
        if (!recallContext) {
          return null;
        }
        
        return {
          recallId: recallContext.actualId,
          confidence: match.confidence,
          similarity: recallContext.similarity,
          reason: match.reason
        };
      })
      .filter((m): m is FinalMatch => m !== null);

    console.log(`Final matches: ${finalMatches.length} recalls`);

    // Step 7: Update recollections table
    if (finalMatches.length > 0) {
      // Delete existing recollections for this category
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

      // Insert new recollections
      const recollectionsToInsert = finalMatches.map((match) => ({
        recall_id: match.recallId,
        user_id: categoryData.user_id,
        category_id: categoryId,
        match_score: match.confidence
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
      console.log('No high-confidence matches found');
      
      // Delete existing recollections
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
    console.log('=== New Category Matching completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    return new Response(JSON.stringify({
      success: true,
      categoryId,
      categoryName: categoryData.category_name,
      candidateCount: candidateRecalls.length,
      matchCount: finalMatches.length,
      matches: finalMatches.map((m) => ({
        recallId: m.recallId,
        confidence: m.confidence,
        similarity: Math.round(m.similarity * 100),
        reason: m.reason
      })),
      processingTimeMs: processingTime
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in New Category Matching Edge Function ===');
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
</write file>

<write file="app/(tabs)/(home)/index.tsx">
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, Modal, Platform, Alert, Keyboard } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { CategoryCarousel } from '@/components/CategoryCarousel';
import { CombinedSearchAdd } from '@/components/CombinedSearchAdd';
import { supabase } from '@/utils/supabase';
import { uploadImageToDatabase } from '@/utils/supabase';
import { NoteCardSkeleton } from '@/components/NoteCardSkeleton';

interface CreateRecallData {
  text: string;
  images: string[];
  location?: {
    latitude: number;
    longitude: number;
    name: string;
  };
}

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote, isDeletingNote } = useNotes();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [categoryRefreshTrigger, setCategoryRefreshTrigger] = useState(0);
  const [combinedAddSearchEnabled, setCombinedAddSearchEnabled] = useState(true);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [hasCheckedForRecalls, setHasCheckedForRecalls] = useState(false);
  const [hasRecalls, setHasRecalls] = useState(false);

  // Check if user has any recalls
  useEffect(() => {
    const checkForRecalls = async () => {
      if (!user) {
        setHasCheckedForRecalls(true);
        setHasRecalls(false);
        return;
      }

      try {
        const { error, count } = await supabase
          .from('recalls')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .limit(1);

        if (error) {
          console.error('Error checking for recalls:', error);
          setHasRecalls(false);
        } else {
          setHasRecalls((count || 0) > 0);
        }
      } catch (error) {
        console.error('Exception checking for recalls:', error);
        setHasRecalls(false);
      } finally {
        setHasCheckedForRecalls(true);
      }
    };

    checkForRecalls();
  }, [user]);

  // Load user preferences
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!user) {
        setLoadingPreferences(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('combined_add_search_enabled')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading user preferences:', error);
        } else if (data) {
          setCombinedAddSearchEnabled(data.combined_add_search_enabled !== false);
        }
      } catch (error) {
        console.error('Exception loading user preferences:', error);
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadUserPreferences();
  }, [user]);

  // Update the previous notes count whenever notes change
  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  useFocusEffect(
    useCallback(() => {
      console.log('[useFocusEffect] Home screen focused');
      
      // Skip auto-refresh on first focus (initial load)
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      
      // Check if a new recall was created (notes count increased)
      const currentCount = notes.length;
      const previousCount = previousNotesCountRef.current;
      
      if (currentCount > previousCount) {
        console.log('[useFocusEffect] New recall detected, auto-refreshing...');
        refreshNotes();
      }
      
      // Restore scroll position after a short delay
      const savedScrollPosition = scrollPositionRef.current;
      if (savedScrollPosition > 0 && scrollViewRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: savedScrollPosition, animated: false });
        }, 100);
      }
      
      // Cleanup function
      return () => {
        console.log('[useFocusEffect] Home screen unfocused');
      };
    }, [notes.length, refreshNotes])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    console.log('[handleRefresh] Refreshing landing page data from Supabase...');
    
    try {
      console.log('[handleRefresh] Refreshing all recalls...');
      await refreshNotes();
      
      // Refresh categories
      setCategoryRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('[handleRefresh] Error refreshing data:', error);
    } finally {
      setRefreshing(false);
      console.log('[handleRefresh] Refresh complete');
    }
  };

  const handleRecallIconPress = async () => {
    console.log('[handleRecallIconPress] Recall icon pressed - reloading');
    
    // Scroll to top
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
    
    // Reload landing page data
    await handleRefresh();
  };

  const handleAddRecall = () => {
    console.log('[handleAddRecall] Add recall button pressed');
    
    // Haptic feedback when add icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // Navigate directly to recall editor
    try {
      router.push('/note-editor');
    } catch (error) {
      console.error('Error navigating to recall editor:', error);
    }
  };

  const handleNotePress = (noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to recall editor:', error);
    }
  };

  const handleSearch = () => {
    // Haptic feedback when search icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    try {
      router.push('/search');
    } catch (error) {
      console.error('Error navigating to search:', error);
    }
  };

  const handleProfile = () => {
    try {
      router.push('/(tabs)/profile');
    } catch (error) {
      console.error('Error navigating to profile:', error);
    }
  };

  const handleScroll = useCallback((event: any) => {
    try {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      
      // Save scroll position to ref (doesn't trigger re-render)
      scrollPositionRef.current = contentOffset.y;

      // Dismiss keyboard when scrolling
      Keyboard.dismiss();

      // Load more recalls when near bottom
      const paddingToBottom = 20;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
        console.log('[handleScroll] Loading more recalls...');
        loadMoreNotes();
      }
    } catch (error) {
      console.error('Error handling scroll:', error);
    }
  }, [hasMore, isLoadingMore, loading, loadMoreNotes]);

  const handleCreateRecallFromCombined = async (data: CreateRecallData) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a recall');
      return;
    }

    console.log('[handleCreateRecallFromCombined] Starting recall creation');
    console.log('[handleCreateRecallFromCombined] Text length:', data.text.length);
    console.log('[handleCreateRecallFromCombined] Number of images:', data.images.length);
    console.log('[handleCreateRecallFromCombined] Has location:', !!data.location);

    try {
      setIsSaving(true);

      // Step 1: Create the recall first (fast operation)
      console.log('[handleCreateRecallFromCombined] Step 1: Creating recall record...');
      const recallStartTime = Date.now();
      
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert({
          text: data.text,
          user_id: user.id,
          latitude: data.location?.latitude,
          longitude: data.location?.longitude,
          location: data.location?.name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      const recallDuration = Date.now() - recallStartTime;
      console.log(`[handleCreateRecallFromCombined] Recall created in ${recallDuration}ms`);

      if (recallError) {
        console.error('[handleCreateRecallFromCombined] Error creating recall:', recallError);
        Alert.alert('Error', 'Failed to create recall');
        return;
      }

      console.log('[handleCreateRecallFromCombined] Recall created with ID:', recallData.id);

      // Step 2: Upload images - FIRST IMAGE SYNCHRONOUSLY, REST ASYNCHRONOUSLY
      if (data.images.length > 0) {
        console.log('[handleCreateRecallFromCombined] Step 2: Uploading images...');
        const imageStartTime = Date.now();
        
        // Upload FIRST image synchronously
        console.log(`[handleCreateRecallFromCombined] Uploading first image synchronously (1/${data.images.length})...`);
        try {
          const firstImageId = await uploadImageToDatabase(data.images[0], recallData.id, 'image/jpeg');
          
          if (firstImageId) {
            console.log('[handleCreateRecallFromCombined] First image uploaded successfully with ID:', firstImageId);
            
            // FIXED: Refresh the note immediately after first image upload
            console.log('[handleCreateRecallFromCombined] Refreshing note after first image upload');
            await refreshSingleNote(recallData.id);
          } else {
            console.error('[handleCreateRecallFromCombined] First image upload failed - no ID returned');
          }
        } catch (uploadError) {
          console.error('[handleCreateRecallFromCombined] Exception uploading first image:', uploadError);
        }
        
        const firstImageDuration = Date.now() - imageStartTime;
        console.log(`[handleCreateRecallFromCombined] First image uploaded in ${firstImageDuration}ms`);
        
        // Upload REMAINING images ASYNCHRONOUSLY (don't wait)
        if (data.images.length > 1) {
          console.log(`[handleCreateRecallFromCombined] Uploading remaining ${data.images.length - 1} images asynchronously...`);
          
          // Fire and forget - upload remaining images in background
          (async () => {
            for (let i = 1; i < data.images.length; i++) {
              const uri = data.images[i];
              console.log(`[handleCreateRecallFromCombined] [ASYNC] Uploading image ${i + 1}/${data.images.length}...`);
              
              try {
                const imageId = await uploadImageToDatabase(uri, recallData.id, 'image/jpeg');
                
                if (imageId) {
                  console.log(`[handleCreateRecallFromCombined] [ASYNC] Image ${i + 1} uploaded successfully with ID:`, imageId);
                  
                  // FIXED: Refresh the single note immediately after each successful upload
                  // This ensures the carousel counter updates in real-time
                  console.log(`[handleCreateRecallFromCombined] [ASYNC] Refreshing note ${recallData.id} after image ${i + 1} upload`);
                  await refreshSingleNote(recallData.id);
                } else {
                  console.error(`[handleCreateRecallFromCombined] [ASYNC] Image ${i + 1} upload failed - no ID returned`);
                }
                
                // Small delay between uploads to prevent overwhelming the system
                if (i < data.images.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (uploadError) {
                console.error(`[handleCreateRecallFromCombined] [ASYNC] Exception uploading image ${i + 1}:`, uploadError);
                // Continue with next image even if one fails
              }
            }
            
            console.log('[handleCreateRecallFromCombined] [ASYNC] All remaining images uploaded');
            
            // Final refresh to ensure everything is up to date
            console.log(`[handleCreateRecallFromCombined] [ASYNC] Final refresh of note ${recallData.id}`);
            await refreshSingleNote(recallData.id);
          })();
        }
      }

      // Step 3: Refresh the recalls list
      console.log('[handleCreateRecallFromCombined] Step 3: Refreshing recalls list...');
      await refreshNotes();

      // Show success feedback
      console.log('[handleCreateRecallFromCombined] Recall creation complete!');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      // Note: OCR, people finder, and category matching are triggered automatically
      // by database triggers in the background. No need to wait for them.
      console.log('[handleCreateRecallFromCombined] Background processing (OCR, people finder) will run asynchronously');
      
    } catch (error) {
      console.error('[handleCreateRecallFromCombined] Exception in recall creation:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsSaving(false);
    }
  };

  const renderEmptyState = () => {
    const { ZeroState } = require('@/components/ZeroState');
    return (
      <ZeroState
        icon="doc.text"
        title="No Recalls Yet"
        message="Start capturing your thoughts, memories, and moments"
        actionText="Create Your First Recall"
        onActionPress={handleAddRecall}
        animatedIcon={true}
      />
    );
  };

  // Render skeleton loaders for initial load
  const renderSkeletons = () => {
    return (
      <View style={styles.allNotesSection}>
        {[...Array(3)].map((_, index) => (
          <NoteCardSkeleton key={`skeleton-${index}`} />
        ))}
      </View>
    );
  };

  // Show skeletons if:
  // 1. Still loading AND haven't checked for recalls yet, OR
  // 2. Still loading AND have checked but notes array is empty (initial load)
  const shouldShowSkeletons = loading && (!hasCheckedForRecalls || notes.length === 0);
  
  // Show zero state only if:
  // 1. We've checked for recalls
  // 2. User has no recalls
  // 3. Notes array is empty
  // 4. Not currently loading
  const shouldShowZeroState = hasCheckedForRecalls && !hasRecalls && notes.length === 0 && !loading;
  
  // Show content if:
  // 1. We've checked for recalls AND
  // 2. Either have recalls OR have notes loaded
  const shouldShowContent = hasCheckedForRecalls && (hasRecalls || notes.length > 0);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Recall',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontSize: 32,
            fontWeight: 'bold',
            color: colors.primary,
          },
          headerLeft: () => (
            <Pressable onPress={handleRecallIconPress} style={styles.headerButton}>
              <Image
                source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
                style={styles.headerIcon}
                resizeMode="contain"
              />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleProfile} style={styles.headerButton}>
              <IconSymbol 
                name="person.circle.fill" 
                size={32} 
                color={colors.text} 
              />
            </Pressable>
          ),
        }}
      />

      {/* Main Content ScrollView - Category Carousel is now inside and scrolls with content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          combinedAddSearchEnabled && styles.scrollContentWithCombined,
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Category Carousel - Now scrolls with content */}
        {user && (
          <View style={styles.categoryCarouselContainer}>
            <CategoryCarousel
              userId={user.id}
              refreshTrigger={categoryRefreshTrigger}
            />
          </View>
        )}

        {shouldShowSkeletons ? (
          renderSkeletons()
        ) : shouldShowZeroState ? (
          renderEmptyState()
        ) : shouldShowContent ? (
          <View style={styles.notesContainer}>
            {/* Recalls section */}
            <View style={styles.allNotesSection}>
              {notes.map((note, index) => (
                <NoteCard
                  key={`${note.id}-${index}`}
                  note={note}
                  onPress={() => handleNotePress(note.id)}
                  loading={false}
                />
              ))}
            </View>

            {isLoadingMore && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingMoreText}>Loading more...</Text>
              </View>
            )}
            {!hasMore && notes.length > 0 && (
              <View style={styles.endContainer}>
                <Text style={styles.endText}>You&apos;ve reached the end</Text>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Combined Search/Add Component - Now at bottom of screen */}
      {combinedAddSearchEnabled && user && !loadingPreferences && (
        <CombinedSearchAdd
          onCreateRecall={handleCreateRecallFromCombined}
          userId={user.id}
        />
      )}

      {/* Deletion Indicator Modal */}
      <Modal
        visible={isDeletingNote}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Deleting recall...</Text>
          </View>
        </View>
      </Modal>

      {/* Saving Indicator Modal */}
      <Modal
        visible={isSaving}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Saving recall...</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  scrollContentWithCombined: {
    paddingBottom: 200,
  },
  categoryCarouselContainer: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  notesContainer: {
    width: '100%',
  },
  allNotesSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingMoreText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  endContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  endText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  headerIcon: {
    width: 36,
    height: 36,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletionModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletionModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  deletionModalText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});
