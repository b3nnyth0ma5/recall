
# Cloudflare CDN Setup Guide

This guide will help you set up Cloudflare Images CDN for storing and retrieving images in your Recalls app.

## Prerequisites

- A Cloudflare account (free tier available)
- Access to your Supabase project dashboard

## Step 1: Set Up Cloudflare Images

1. **Sign up for Cloudflare** (if you haven't already):
   - Go to https://dash.cloudflare.com/sign-up
   - Create a free account

2. **Enable Cloudflare Images**:
   - Log in to your Cloudflare dashboard
   - Navigate to "Images" in the left sidebar
   - Click "Get Started" to enable Cloudflare Images
   - Note: Cloudflare Images has a free tier with 100,000 images and 500,000 transformations per month

3. **Get your Account ID**:
   - In the Cloudflare dashboard, click on "Images"
   - Your Account ID is displayed at the top of the page
   - Copy this ID (format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

4. **Get your Account Hash**:
   - In the Images section, look for "Account Hash" or "Delivery URL"
   - The Account Hash is part of the delivery URL: `https://imagedelivery.net/<ACCOUNT_HASH>/...`
   - Copy this hash (format: `xxxxxxxxxxxx`)

5. **Create an API Token**:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Click "Use template" next to "Edit Cloudflare Images"
   - Or create a custom token with the following permissions:
     - Account > Cloudflare Images > Edit
   - Click "Continue to summary"
   - Click "Create Token"
   - **IMPORTANT**: Copy the token immediately - you won't be able to see it again!
   - The token format looks like: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Configure Supabase Edge Functions

1. **Set Environment Variables in Supabase**:
   - Go to your Supabase project dashboard: https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib
   - Navigate to "Edge Functions" in the left sidebar
   - Click on "Manage secrets"
   - Add the following secrets:

   ```
   CLOUDFLARE_ACCOUNT_ID=your_account_id_here
   CLOUDFLARE_API_TOKEN=your_api_token_here
   CLOUDFLARE_ACCOUNT_HASH=your_account_hash_here
   ```

   Replace the values with your actual Cloudflare credentials from Step 1.

## Step 3: Deploy Edge Functions

Deploy the Cloudflare CDN edge functions to your Supabase project:

```bash
# Deploy the upload function
supabase functions deploy cloudflare-upload

# Deploy the delete function
supabase functions deploy cloudflare-delete

# Deploy the config check function
supabase functions deploy cloudflare-check-config
```

## Step 4: Verify Configuration

1. **Test the configuration**:
   - Open your app
   - Try uploading an image
   - Check the console logs to verify the image is being uploaded to Cloudflare CDN
   - You should see logs like:
     ```
     === Uploading image to Cloudflare CDN ===
     CDN upload successful, storing metadata in database...
     CDN URL: https://imagedelivery.net/...
     ```

2. **Check Cloudflare Dashboard**:
   - Go to your Cloudflare Images dashboard
   - You should see the uploaded images listed there
   - Click on an image to view its details and variants

## Step 5: Image Transformations (Optional)

Cloudflare Images supports automatic image transformations via URL parameters. The app includes helper functions to generate optimized URLs:

```typescript
import { getCloudflareImagePresets } from '@/utils/cloudflareCDN';

const cdnUrl = 'https://imagedelivery.net/...';
const presets = getCloudflareImagePresets(cdnUrl);

// Use different variants:
// presets.thumbnail - 150x150, quality 70, webp
// presets.card - 400x400, quality 80, webp
// presets.preview - 800x800, quality 85, webp
// presets.full - original image
```

## Troubleshooting

### Images not uploading to CDN

1. **Check environment variables**:
   - Verify all three environment variables are set correctly in Supabase
   - Make sure there are no extra spaces or quotes

2. **Check API token permissions**:
   - Ensure the API token has "Cloudflare Images > Edit" permission
   - Try creating a new token if the current one doesn't work

3. **Check Cloudflare Images status**:
   - Verify Cloudflare Images is enabled in your account
   - Check if you've reached any rate limits or quotas

4. **Check edge function logs**:
   - Go to Supabase dashboard > Edge Functions > cloudflare-upload
   - Click "Logs" to see detailed error messages

### Images not displaying

1. **Check CDN URL format**:
   - CDN URLs should look like: `https://imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>/public`
   - Verify the Account Hash is correct

2. **Check image permissions**:
   - Cloudflare Images are public by default
   - Verify the image exists in your Cloudflare dashboard

3. **Check CORS settings**:
   - Cloudflare Images should work with CORS by default
   - If you have custom CORS rules, ensure they allow your app's domain

### Fallback to database storage

If CDN upload fails, the app automatically falls back to storing images as base64 in the database. This ensures images are never lost, but:

- Database storage is less efficient for large images
- No automatic image optimization
- Higher bandwidth usage

To migrate existing base64 images to CDN, you would need to:
1. Fetch images from the database
2. Upload them to Cloudflare CDN
3. Update the `cdn_url` field in the database
4. Optionally clear the `image_data` field to save space

## Cost Considerations

Cloudflare Images pricing (as of 2024):

- **Free tier**: 100,000 images stored, 500,000 transformations/month
- **Paid tier**: $5/month for 100,000 images stored, $1 per 100,000 transformations

For most personal apps, the free tier should be sufficient. Monitor your usage in the Cloudflare dashboard.

## Security Notes

- **API Token**: Keep your API token secure. Never commit it to version control.
- **Environment Variables**: Store credentials only in Supabase Edge Function secrets.
- **Public Images**: By default, all uploaded images are publicly accessible via their CDN URL.
- **Image Deletion**: When deleting a note, images are automatically deleted from both Cloudflare CDN and the database.

## Next Steps

- Set up image optimization presets for different use cases
- Configure custom variants in Cloudflare dashboard
- Monitor usage and costs in Cloudflare dashboard
- Consider implementing image compression before upload for better performance

## Support

If you encounter issues:

1. Check the Cloudflare Images documentation: https://developers.cloudflare.com/images/
2. Review Supabase Edge Functions logs for detailed error messages
3. Verify all environment variables are set correctly
4. Test the configuration using the `cloudflare-check-config` edge function
