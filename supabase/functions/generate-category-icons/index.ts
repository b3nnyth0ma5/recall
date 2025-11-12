
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Category {
  id: string;
  category_name: string;
  icon_cdn_url?: string;
}

// Primary accent color from the app
const PRIMARY_COLOR = '#FF6B7A';

// SVG icon templates for each category
// Simple, stylish icons using the primary accent color
const categoryIcons: Record<string, string> = {
  'Activities': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="30" r="12" fill="${PRIMARY_COLOR}" opacity="0.9"/>
      <path d="M50 45 L50 70 M35 55 L50 55 L65 55 M35 85 L50 70 L65 85" 
            stroke="${PRIMARY_COLOR}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  `,
  'Animals': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="55" r="20" fill="${PRIMARY_COLOR}" opacity="0.9"/>
      <circle cx="35" cy="35" r="8" fill="${PRIMARY_COLOR}"/>
      <circle cx="65" cy="35" r="8" fill="${PRIMARY_COLOR}"/>
      <circle cx="30" cy="70" r="6" fill="${PRIMARY_COLOR}"/>
      <circle cx="70" cy="70" r="6" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Art': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M30 70 Q40 30, 50 50 T70 70" stroke="${PRIMARY_COLOR}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="70" r="5" fill="${PRIMARY_COLOR}"/>
      <circle cx="50" cy="50" r="5" fill="${PRIMARY_COLOR}"/>
      <circle cx="70" cy="70" r="5" fill="${PRIMARY_COLOR}"/>
      <rect x="25" y="20" width="50" height="3" fill="${PRIMARY_COLOR}" opacity="0.6"/>
    </svg>
  `,
  'Beer': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="35" y="30" width="30" height="50" rx="3" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <rect x="35" y="35" width="30" height="15" fill="${PRIMARY_COLOR}" opacity="0.3"/>
      <path d="M65 45 L75 45 Q80 45, 80 50 L80 60 Q80 65, 75 65 L65 65" 
            stroke="${PRIMARY_COLOR}" stroke-width="3" fill="none"/>
      <line x1="35" y1="25" x2="65" y2="25" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `,
  'Cocktails': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M30 25 L70 25 L50 55 L50 75" stroke="${PRIMARY_COLOR}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <line x1="40" y1="75" x2="60" y2="75" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 25 L70 25 L50 55 Z" fill="${PRIMARY_COLOR}" opacity="0.3"/>
      <circle cx="55" cy="35" r="3" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Countries': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="30" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <ellipse cx="50" cy="50" rx="15" ry="30" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <line x1="20" y1="50" x2="80" y2="50" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <path d="M50 20 Q60 35, 50 50 Q40 65, 50 80" stroke="${PRIMARY_COLOR}" stroke-width="2" fill="none"/>
    </svg>
  `,
  'Cultural': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="30" y="40" width="40" height="35" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <path d="M25 40 L50 25 L75 40" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="42" y="55" width="16" height="20" fill="${PRIMARY_COLOR}" opacity="0.6"/>
      <circle cx="38" cy="55" r="3" fill="${PRIMARY_COLOR}"/>
      <circle cx="62" cy="55" r="3" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Dessert': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M35 50 Q35 35, 50 35 Q65 35, 65 50" fill="${PRIMARY_COLOR}" opacity="0.3"/>
      <path d="M35 50 L65 50 L60 70 L40 70 Z" fill="${PRIMARY_COLOR}" opacity="0.6"/>
      <circle cx="50" cy="28" r="4" fill="${PRIMARY_COLOR}"/>
      <line x1="50" y1="28" x2="50" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
    </svg>
  `,
  'Events': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="30" y="35" width="40" height="45" rx="3" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <line x1="30" y1="45" x2="70" y2="45" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <line x1="40" y1="25" x2="40" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linecap="round"/>
      <line x1="60" y1="25" x2="60" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="42" cy="55" r="2" fill="${PRIMARY_COLOR}"/>
      <circle cx="50" cy="55" r="2" fill="${PRIMARY_COLOR}"/>
      <circle cx="58" cy="55" r="2" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Food': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="25" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <path d="M30 50 Q40 35, 50 50 T70 50" fill="${PRIMARY_COLOR}" opacity="0.4"/>
      <circle cx="42" cy="45" r="3" fill="${PRIMARY_COLOR}"/>
      <circle cx="58" cy="45" r="3" fill="${PRIMARY_COLOR}"/>
      <circle cx="50" cy="55" r="3" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Ideas': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="45" r="18" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <path d="M42 63 L58 63 L56 73 L44 73 Z" fill="${PRIMARY_COLOR}" opacity="0.6"/>
      <line x1="45" y1="73" x2="55" y2="73" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linecap="round"/>
      <line x1="50" y1="20" x2="50" y2="27" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <line x1="70" y1="30" x2="65" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <line x1="30" y1="30" x2="35" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `,
  'Menus': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="30" y="25" width="40" height="50" rx="2" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <line x1="38" y1="38" x2="62" y2="38" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <line x1="38" y1="48" x2="62" y2="48" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <line x1="38" y1="58" x2="55" y2="58" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="38" cy="38" r="2" fill="${PRIMARY_COLOR}"/>
      <circle cx="38" cy="48" r="2" fill="${PRIMARY_COLOR}"/>
      <circle cx="38" cy="58" r="2" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Movies': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="25" y="35" width="50" height="35" rx="2" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <path d="M40 50 L60 52.5 L40 55 Z" fill="${PRIMARY_COLOR}"/>
      <circle cx="30" cy="30" r="4" fill="${PRIMARY_COLOR}"/>
      <circle cx="45" cy="30" r="4" fill="${PRIMARY_COLOR}"/>
      <circle cx="55" cy="30" r="4" fill="${PRIMARY_COLOR}"/>
      <circle cx="70" cy="30" r="4" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Recipes': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="32" y="25" width="36" height="50" rx="2" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <line x1="32" y1="35" x2="68" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <line x1="40" y1="45" x2="60" y2="45" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <line x1="40" y1="53" x2="60" y2="53" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <line x1="40" y1="61" x2="55" y2="61" stroke="${PRIMARY_COLOR}" stroke-width="2" stroke-linecap="round"/>
      <path d="M50 15 L55 25 L45 25 Z" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Retail': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M30 40 L35 25 L65 25 L70 40" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="28" y="40" width="44" height="35" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <path d="M28 40 L35 40 L35 50 L28 50" fill="${PRIMARY_COLOR}" opacity="0.3"/>
      <path d="M72 40 L65 40 L65 50 L72 50" fill="${PRIMARY_COLOR}" opacity="0.3"/>
      <circle cx="55" cy="57" r="3" fill="${PRIMARY_COLOR}"/>
    </svg>
  `,
  'Sport': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="25" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <path d="M50 25 L50 75 M25 50 L75 50" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <path d="M35 35 Q50 50, 35 65" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <path d="M65 35 Q50 50, 65 65" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
    </svg>
  `,
  'TV Shows': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="25" y="35" width="50" height="40" rx="3" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <line x1="35" y1="28" x2="40" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <line x1="60" y1="28" x2="65" y2="35" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <circle cx="40" cy="50" r="3" fill="${PRIMARY_COLOR}"/>
      <circle cx="50" cy="50" r="3" fill="${PRIMARY_COLOR}"/>
      <circle cx="60" cy="50" r="3" fill="${PRIMARY_COLOR}"/>
      <rect x="35" y="60" width="8" height="8" fill="${PRIMARY_COLOR}" opacity="0.6"/>
      <rect x="46" y="60" width="8" height="8" fill="${PRIMARY_COLOR}" opacity="0.6"/>
      <rect x="57" y="60" width="8" height="8" fill="${PRIMARY_COLOR}" opacity="0.6"/>
    </svg>
  `,
  'Vehicles': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M25 55 L30 45 L40 45 L45 35 L65 35 L70 45 L75 55" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="25" y="55" width="50" height="15" rx="2" fill="${PRIMARY_COLOR}" opacity="0.3" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
      <circle cx="35" cy="70" r="6" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <circle cx="65" cy="70" r="6" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <rect x="45" y="45" width="15" height="10" fill="${PRIMARY_COLOR}" opacity="0.5"/>
    </svg>
  `,
  'Whiskey': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M35 30 L40 70 L60 70 L65 30 Z" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <rect x="32" y="25" width="36" height="8" rx="1" fill="${PRIMARY_COLOR}" opacity="0.6"/>
      <line x1="40" y1="50" x2="60" y2="50" stroke="${PRIMARY_COLOR}" stroke-width="2" opacity="0.5"/>
      <path d="M40 50 L42 60 L58 60 L60 50" fill="${PRIMARY_COLOR}" opacity="0.3"/>
    </svg>
  `,
  'Wine': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M35 25 L35 45 Q35 55, 50 55 Q65 55, 65 45 L65 25" fill="none" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <line x1="50" y1="55" x2="50" y2="70" stroke="${PRIMARY_COLOR}" stroke-width="3"/>
      <line x1="40" y1="70" x2="60" y2="70" stroke="${PRIMARY_COLOR}" stroke-width="3" stroke-linecap="round"/>
      <path d="M35 35 Q35 45, 50 45 Q65 45, 65 35" fill="${PRIMARY_COLOR}" opacity="0.3"/>
      <line x1="35" y1="25" x2="65" y2="25" stroke="${PRIMARY_COLOR}" stroke-width="2"/>
    </svg>
  `,
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== Generate Category Icons Edge Function ===');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Cloudflare credentials
    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const CLOUDFLARE_ACCOUNT_HASH = Deno.env.get('CLOUDFLARE_ACCOUNT_HASH');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_HASH) {
      console.error('Missing Cloudflare configuration');
      return new Response(
        JSON.stringify({ 
          error: 'Cloudflare CDN is not configured' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Fetch all categories
    const { data: categories, error: fetchError } = await supabase
      .from('recollection_categories')
      .select('id, category_name, icon_cdn_url')
      .order('category_name');

    if (fetchError) {
      console.error('Error fetching categories:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch categories', details: fetchError }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Found ${categories.length} categories`);

    const results = [];
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Process each category
    for (const category of categories as Category[]) {
      try {
        // Skip if already has an icon
        if (category.icon_cdn_url) {
          console.log(`Skipping ${category.category_name} - already has icon`);
          skipCount++;
          results.push({
            category: category.category_name,
            status: 'skipped',
            reason: 'Already has icon',
            cdnUrl: category.icon_cdn_url,
          });
          continue;
        }

        // Get the SVG template for this category
        const svgTemplate = categoryIcons[category.category_name];
        
        if (!svgTemplate) {
          console.log(`No icon template for ${category.category_name}`);
          errorCount++;
          results.push({
            category: category.category_name,
            status: 'error',
            reason: 'No icon template found',
          });
          continue;
        }

        // Clean up the SVG (remove extra whitespace)
        const cleanSvg = svgTemplate.trim().replace(/\s+/g, ' ');
        
        // Convert SVG to base64
        const svgBase64 = btoa(cleanSvg);

        // Upload to Cloudflare
        const fileName = `category-${category.category_name.toLowerCase().replace(/\s+/g, '-')}.svg`;
        
        const formData = new FormData();
        const svgBlob = new Blob([cleanSvg], { type: 'image/svg+xml' });
        formData.append('file', svgBlob, fileName);

        const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;
        
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`Failed to upload icon for ${category.category_name}:`, errorText);
          errorCount++;
          results.push({
            category: category.category_name,
            status: 'error',
            reason: 'Upload failed',
            details: errorText,
          });
          continue;
        }

        const uploadResult = await uploadResponse.json();
        const imageId = uploadResult.result.id;
        const cdnUrl = `https://imagedelivery.net/${CLOUDFLARE_ACCOUNT_HASH}/${imageId}/public`;

        console.log(`Uploaded icon for ${category.category_name}: ${cdnUrl}`);

        // Update the database with the CDN URL
        const { error: updateError } = await supabase
          .from('recollection_categories')
          .update({ icon_cdn_url: cdnUrl })
          .eq('id', category.id);

        if (updateError) {
          console.error(`Failed to update database for ${category.category_name}:`, updateError);
          errorCount++;
          results.push({
            category: category.category_name,
            status: 'error',
            reason: 'Database update failed',
            details: updateError,
            cdnUrl,
          });
          continue;
        }

        successCount++;
        results.push({
          category: category.category_name,
          status: 'success',
          cdnUrl,
        });

      } catch (error) {
        console.error(`Exception processing ${category.category_name}:`, error);
        errorCount++;
        results.push({
          category: category.category_name,
          status: 'error',
          reason: 'Exception',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`=== Processing complete ===`);
    console.log(`Success: ${successCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: {
          total: categories.length,
          success: successCount,
          skipped: skipCount,
          errors: errorCount,
        },
        results,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Exception in generate-category-icons:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
