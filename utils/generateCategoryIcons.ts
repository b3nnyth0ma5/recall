
import { supabase } from './supabase';

/**
 * Invoke the generate-category-icons edge function to create and upload
 * SVG icons for all categories to Cloudflare CDN
 * 
 * This function should be called once to initialize all category icons
 * 
 * @returns Promise with the results of the icon generation
 */
export async function generateCategoryIcons(): Promise<{
  success: boolean;
  summary?: {
    total: number;
    success: number;
    skipped: number;
    errors: number;
  };
  results?: Array<{
    category: string;
    status: 'success' | 'skipped' | 'error';
    cdnUrl?: string;
    reason?: string;
    details?: any;
  }>;
  error?: string;
}> {
  try {
    console.log('=== Invoking generate-category-icons edge function ===');

    const { data, error } = await supabase.functions.invoke('generate-category-icons', {
      body: {},
    });

    if (error) {
      console.error('Error invoking generate-category-icons:', error);
      return {
        success: false,
        error: error.message || 'Failed to invoke edge function',
      };
    }

    console.log('=== Icon generation complete ===');
    console.log('Summary:', data.summary);

    return data;
  } catch (error) {
    console.error('Exception in generateCategoryIcons:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch all categories with their icon URLs
 * 
 * @returns Promise with array of categories
 */
export async function getCategoriesWithIcons(): Promise<Array<{
  id: string;
  category_name: string;
  icon_cdn_url: string | null;
}>> {
  try {
    const { data, error } = await supabase
      .from('recollection_categories')
      .select('id, category_name, icon_cdn_url')
      .order('category_name');

    if (error) {
      console.error('Error fetching categories:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception in getCategoriesWithIcons:', error);
    return [];
  }
}
