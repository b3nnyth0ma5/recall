
# Gcore CDN Upload Error Fix

## Problem
The app was experiencing a "404 404 page not found" error when uploading images to Gcore CDN. This was caused by using an incorrect API endpoint.

## Root Cause
The previous implementation used:
```
POST https://api.gcore.com/storage/v1/storage/{storage_name}/upload
```

However, Gcore Storage API uses a different approach:
```
PUT https://api.gcore.com/storage/v1/storage/{storage_name}/{file_path}
```

## Solution
The edge functions have been updated to use the correct API endpoints:

### Upload Endpoint
- **Method**: PUT (not POST)
- **URL**: `https://api.gcore.com/storage/v1/storage/{storage_name}/{file_path}`
- **Headers**: 
  - `Authorization: APIKey {your_api_key}`
  - `Content-Type: {image_content_type}`
- **Body**: Raw binary data (not FormData)

### Delete Endpoint
- **Method**: DELETE
- **URL**: `https://api.gcore.com/storage/v1/storage/{storage_name}/{file_path}`
- **Headers**: 
  - `Authorization: APIKey {your_api_key}`

## Deployment Steps

### 1. Deploy the Updated Edge Functions

You need to deploy the updated edge functions to Supabase. Run these commands in your terminal:

```bash
# Deploy gcore-upload function
npx supabase functions deploy gcore-upload --project-ref cesmsdnblkdjkskmiqib

# Deploy gcore-delete function
npx supabase functions deploy gcore-delete --project-ref cesmsdnblkdjkskmiqib
```

### 2. Verify Environment Variables

Make sure the following environment variables are set in your Supabase project:

- `GCORE_API_KEY`: Your Gcore API key (required)
- `GCORE_STORAGE_NAME`: Your Gcore storage name (optional, defaults to 'natively-images')
- `GCORE_CDN_DOMAIN`: Your CDN domain (optional, defaults to '{storage_name}.gcdn.co')

To set environment variables:

1. Go to your Supabase dashboard
2. Navigate to Project Settings > Edge Functions
3. Add the environment variables

### 3. Test the Upload

After deploying, test the upload by:

1. Opening the app
2. Creating a new note
3. Adding an image
4. Saving the note

Check the console logs for any errors. You should see:
```
=== Uploading to Gcore CDN ===
File name: image-xxxxx.jpg
Content type: image/jpeg
Uploading to: https://api.gcore.com/storage/v1/storage/natively-images/images/image-xxxxx.jpg
=== Upload successful ===
CDN URL: https://natively-images.gcdn.co/images/image-xxxxx.jpg
```

## Configuration Notes

### Storage Name
The storage name should match your Gcore storage bucket name. You can find this in your Gcore dashboard under Storage.

### CDN Domain
The CDN domain format depends on your Gcore configuration:
- Default: `{storage_name}.gcdn.co`
- Custom domain: If you've configured a custom domain in Gcore, set `GCORE_CDN_DOMAIN` to your custom domain

### File Path Structure
Files are uploaded to: `images/{filename}`

This creates a clean organization structure in your Gcore storage.

## Troubleshooting

### Still Getting 404 Errors?

1. **Verify Storage Name**: Make sure `GCORE_STORAGE_NAME` matches your actual Gcore storage bucket name
2. **Check API Key**: Ensure your `GCORE_API_KEY` is valid and has the correct permissions
3. **Check Logs**: View the edge function logs in Supabase dashboard under Edge Functions > Logs

### Getting 401 Unauthorized?

- Your API key may be invalid or expired
- The API key may not have the correct permissions for the storage bucket

### Getting 403 Forbidden?

- The API key doesn't have write permissions to the storage bucket
- Check your Gcore storage bucket permissions

## Alternative: Using Gcore's S3-Compatible API

If the Storage API continues to have issues, Gcore also provides an S3-compatible API. You can switch to using that instead by modifying the edge functions to use S3 SDK.

## Fallback Behavior

The app is configured to fall back to base64 storage in the database if Gcore upload fails. This ensures images are never lost, even if there are CDN issues.

To check if an image is using CDN or base64:
- CDN images have a `cdn_url` field in the database
- Base64 images have `image_data` field populated

## Next Steps

After deploying the fixes:

1. Test image upload functionality
2. Verify images are accessible via CDN URLs
3. Test image deletion
4. Monitor edge function logs for any errors

If you continue to experience issues, please check the Gcore API documentation or contact Gcore support for assistance with your specific storage configuration.
