
import { supabase } from './supabase';

/**
 * One-time script to generate embeddings for all recall_images with NULL recall_image_embedding
 * 
 * This script:
 * 1. Fetches all recall_images where recall_image_embedding is NULL
 * 2. Invokes the "embedding-image" edge function for each image
 * 3. Logs progress and any errors encountered
 * 
 * Usage:
 * - Import this function in your app and call it once
 * - Or create a button in the app to trigger this manually
 * - Monitor console logs for progress
 */

interface ImageToEmbed {
  id: string;
  ocr_text: string | null;
  image_explanation: string | null;
}

interface EmbeddingResult {
  imageId: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
  processingTimeMs?: number;
}

export async function embedNullImages(): Promise<{
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: EmbeddingResult[];
}> {
  console.log('=== Starting Null Image Embedding Process ===');
  console.log('Timestamp:', new Date().toISOString());

  const results: EmbeddingResult[] = [];
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Step 1: Fetch all images with NULL embeddings
    console.log('Fetching images with NULL embeddings...');
    
    const { data: images, error: fetchError } = await supabase
      .from('recall_images')
      .select('id, ocr_text, image_explanation')
      .is('recall_image_embedding', null);

    if (fetchError) {
      console.error('Error fetching images:', fetchError);
      throw new Error(`Failed to fetch images: ${fetchError.message}`);
    }

    if (!images || images.length === 0) {
      console.log('✅ No images found with null embeddings. All images are already processed!');
      return {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }

    console.log(`📊 Found ${images.length} images to process`);
    console.log('---');

    // Step 2: Process each image
    for (let i = 0; i < images.length; i++) {
      const image = images[i] as ImageToEmbed;
      const progress = `[${i + 1}/${images.length}]`;
      
      console.log(`${progress} Processing image ID: ${image.id}`);

      // Check if there's any text content to embed
      const hasContent = (image.ocr_text && image.ocr_text.trim()) || 
                        (image.image_explanation && image.image_explanation.trim());
      
      if (!hasContent) {
        console.log(`${progress} ⚠️  Skipping - no text content available`);
        skipped++;
        results.push({
          imageId: image.id,
          success: false,
          skipped: true,
          error: 'No text content available (both ocr_text and image_explanation are empty)',
        });
        continue;
      }

      try {
        // Invoke the embedding-image edge function
        const { data, error: functionError } = await supabase.functions.invoke(
          'embedding-image',
          {
            body: {
              recall_image_id: image.id,
              ocr_text: image.ocr_text,
              image_explanation: image.image_explanation,
            },
          }
        );

        if (functionError) {
          console.error(`${progress} ❌ Error invoking function:`, functionError);
          failed++;
          results.push({
            imageId: image.id,
            success: false,
            error: functionError.message || 'Unknown function error',
          });
          continue;
        }

        // Check if the function returned a success response
        if (data && data.success) {
          if (data.skipped) {
            console.log(`${progress} ⏭️  Skipped - ${data.reason}`);
            skipped++;
            results.push({
              imageId: image.id,
              success: true,
              skipped: true,
              processingTimeMs: data.processingTimeMs,
            });
          } else {
            console.log(`${progress} ✅ Successfully embedded (${data.processingTimeMs}ms, ${data.embeddingDimensions} dimensions)`);
            successful++;
            results.push({
              imageId: image.id,
              success: true,
              processingTimeMs: data.processingTimeMs,
            });
          }
        } else {
          console.error(`${progress} ❌ Unexpected response:`, data);
          failed++;
          results.push({
            imageId: image.id,
            success: false,
            error: data?.error || 'Unexpected response format',
          });
        }

        // Add a small delay between requests to avoid overwhelming the edge function
        if (i < images.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (invocationError) {
        console.error(`${progress} ❌ Exception during invocation:`, invocationError);
        failed++;
        results.push({
          imageId: image.id,
          success: false,
          error: invocationError instanceof Error ? invocationError.message : 'Unknown error',
        });
      }
    }

    // Step 3: Summary
    console.log('---');
    console.log('=== Embedding Process Completed ===');
    console.log(`📊 Total images processed: ${images.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log('Timestamp:', new Date().toISOString());

    return {
      totalProcessed: images.length,
      successful,
      failed,
      skipped,
      results,
    };

  } catch (error) {
    console.error('=== Fatal Error in Embedding Process ===');
    console.error('Error:', error);
    throw error;
  }
}

/**
 * Alternative function to process images in batches
 * Useful for large datasets to avoid timeout issues
 */
export async function embedNullImagesInBatches(batchSize: number = 10): Promise<{
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: EmbeddingResult[];
}> {
  console.log('=== Starting Batched Null Image Embedding Process ===');
  console.log('Batch size:', batchSize);
  console.log('Timestamp:', new Date().toISOString());

  const allResults: EmbeddingResult[] = [];
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let offset = 0;
  let batchNumber = 1;

  try {
    while (true) {
      console.log(`\n--- Processing Batch ${batchNumber} (offset: ${offset}) ---`);

      // Fetch a batch of images
      const { data: images, error: fetchError } = await supabase
        .from('recall_images')
        .select('id, ocr_text, image_explanation')
        .is('recall_image_embedding', null)
        .range(offset, offset + batchSize - 1);

      if (fetchError) {
        console.error('Error fetching batch:', fetchError);
        throw new Error(`Failed to fetch batch: ${fetchError.message}`);
      }

      if (!images || images.length === 0) {
        console.log('✅ No more images to process');
        break;
      }

      console.log(`Processing ${images.length} images in this batch`);

      // Process each image in the batch
      for (let i = 0; i < images.length; i++) {
        const image = images[i] as ImageToEmbed;
        const globalIndex = offset + i + 1;
        const progress = `[Batch ${batchNumber}, Image ${i + 1}/${images.length}]`;

        console.log(`${progress} Processing image ID: ${image.id}`);

        const hasContent = (image.ocr_text && image.ocr_text.trim()) || 
                          (image.image_explanation && image.image_explanation.trim());

        if (!hasContent) {
          console.log(`${progress} ⚠️  Skipping - no text content available`);
          totalSkipped++;
          allResults.push({
            imageId: image.id,
            success: false,
            skipped: true,
            error: 'No text content available',
          });
          continue;
        }

        try {
          const { data, error: functionError } = await supabase.functions.invoke(
            'embedding-image',
            {
              body: {
                recall_image_id: image.id,
                ocr_text: image.ocr_text,
                image_explanation: image.image_explanation,
              },
            }
          );

          if (functionError) {
            console.error(`${progress} ❌ Error:`, functionError);
            totalFailed++;
            allResults.push({
              imageId: image.id,
              success: false,
              error: functionError.message || 'Unknown function error',
            });
            continue;
          }

          if (data && data.success) {
            if (data.skipped) {
              console.log(`${progress} ⏭️  Skipped - ${data.reason}`);
              totalSkipped++;
              allResults.push({
                imageId: image.id,
                success: true,
                skipped: true,
                processingTimeMs: data.processingTimeMs,
              });
            } else {
              console.log(`${progress} ✅ Success (${data.processingTimeMs}ms)`);
              totalSuccessful++;
              allResults.push({
                imageId: image.id,
                success: true,
                processingTimeMs: data.processingTimeMs,
              });
            }
          } else {
            console.error(`${progress} ❌ Unexpected response:`, data);
            totalFailed++;
            allResults.push({
              imageId: image.id,
              success: false,
              error: data?.error || 'Unexpected response format',
            });
          }

          // Small delay between requests
          if (i < images.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

        } catch (invocationError) {
          console.error(`${progress} ❌ Exception:`, invocationError);
          totalFailed++;
          allResults.push({
            imageId: image.id,
            success: false,
            error: invocationError instanceof Error ? invocationError.message : 'Unknown error',
          });
        }
      }

      offset += batchSize;
      batchNumber++;

      // If we got fewer images than the batch size, we've reached the end
      if (images.length < batchSize) {
        break;
      }

      // Longer delay between batches
      console.log('Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n=== Batched Embedding Process Completed ===');
    console.log(`📊 Total images processed: ${allResults.length}`);
    console.log(`✅ Successful: ${totalSuccessful}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`⏭️  Skipped: ${totalSkipped}`);
    console.log('Timestamp:', new Date().toISOString());

    return {
      totalProcessed: allResults.length,
      successful: totalSuccessful,
      failed: totalFailed,
      skipped: totalSkipped,
      results: allResults,
    };

  } catch (error) {
    console.error('=== Fatal Error in Batched Embedding Process ===');
    console.error('Error:', error);
    throw error;
  }
}
