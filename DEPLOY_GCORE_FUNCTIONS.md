
# Deploy Gcore Edge Functions

## Quick Deploy Commands

Run these commands in your terminal to deploy the updated Gcore edge functions:

```bash
# Make sure you're logged in to Supabase CLI
npx supabase login

# Deploy gcore-upload function
npx supabase functions deploy gcore-upload --project-ref cesmsdnblkdjkskmiqib

# Deploy gcore-delete function
npx supabase functions deploy gcore-delete --project-ref cesmsdnblkdjkskmiqib

# Deploy gcore-check-config function (if needed)
npx supabase functions deploy gcore-check-config --project-ref cesmsdnblkdjkskmiqib
```

## Set Environment Variables

After deploying, make sure to set the required environment variables:

```bash
# Set Gcore API key
npx supabase secrets set GCORE_API_KEY=your_api_key_here --project-ref cesmsdnblkdjkskmiqib

# Set storage name (optional, defaults to 'natively-images')
npx supabase secrets set GCORE_STORAGE_NAME=your_storage_name --project-ref cesmsdnblkdjkskmiqib

# Set CDN domain (optional, defaults to '{storage_name}.gcdn.co')
npx supabase secrets set GCORE_CDN_DOMAIN=your_cdn_domain --project-ref cesmsdnblkdjkskmiqib
```

## Verify Deployment

Check the deployment status:

```bash
npx supabase functions list --project-ref cesmsdnblkdjkskmiqib
```

## Test the Functions

You can test the functions using curl:

```bash
# Test gcore-check-config
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/gcore-check-config \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Test gcore-upload (with sample base64 data)
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/gcore-upload \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "base64Data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "fileName": "test-image.png",
    "contentType": "image/png"
  }'
```

## View Logs

To view the edge function logs:

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib
2. Navigate to Edge Functions
3. Click on the function name (gcore-upload or gcore-delete)
4. View the logs tab

Or use the CLI:

```bash
npx supabase functions logs gcore-upload --project-ref cesmsdnblkdjkskmiqib
```

## Common Issues

### "Function not found" error
- Make sure you've deployed the function
- Check that the function name is correct

### "Unauthorized" error
- Make sure you're using the correct anon key
- Check that the function is deployed and accessible

### "GCORE_API_KEY not set" error
- Set the environment variable using the secrets command above
- Redeploy the function after setting secrets

## Getting Your Gcore API Key

1. Log in to your Gcore account
2. Go to Account Settings > API Tokens
3. Create a new API token with Storage permissions
4. Copy the token and use it as GCORE_API_KEY

## Getting Your Storage Name

1. Log in to your Gcore account
2. Go to Storage
3. Find your storage bucket name (e.g., "919491-recall-images")
4. Use this as GCORE_STORAGE_NAME
