
# Gcore CDN Quick Start

## What You Need

1. **Gcore API Key** - Get from https://gcore.com
2. **Storage Name** - Your Gcore storage bucket name (e.g., "natively-images")

## Setup Steps (5 minutes)

### 1. Get Gcore Credentials

```
1. Sign up at https://gcore.com
2. Go to Storage → Create Storage
3. Name it (e.g., "natively-images")
4. Go to Account → API Tokens
5. Create token with Storage permissions
6. Copy the API key
```

### 2. Configure Supabase

**Option A: Using CLI**
```bash
npx supabase secrets set GCORE_API_KEY=your_api_key_here --project-ref cesmsdnblkdjkskmiqib
npx supabase secrets set GCORE_STORAGE_NAME=natively-images --project-ref cesmsdnblkdjkskmiqib
```

**Option B: Using Dashboard**
```
1. Go to https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib
2. Edge Functions → Settings
3. Add secrets:
   - GCORE_API_KEY: your_api_key
   - GCORE_STORAGE_NAME: natively-images
```

### 3. Update Database

Run in Supabase SQL Editor:

```sql
ALTER TABLE recall_images ADD COLUMN IF NOT EXISTS cdn_url TEXT;
CREATE INDEX IF NOT EXISTS idx_recall_images_cdn_url ON recall_images(cdn_url) WHERE cdn_url IS NOT NULL;
```

### 4. Deploy Edge Functions

```bash
npx supabase functions deploy gcore-upload --project-ref cesmsdnblkdjkskmiqib
npx supabase functions deploy gcore-delete --project-ref cesmsdnblkdjkskmiqib
npx supabase functions deploy gcore-check-config --project-ref cesmsdnblkdjkskmiqib
```

### 5. Test

Upload an image in the app and check:
- ✅ Image appears in Gcore dashboard
- ✅ Loads quickly in app
- ✅ Database has `cdn_url` populated

## Verify Setup

```bash
# Check if configured
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/gcore-check-config \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Should return: {"configured": true}
```

## That's It!

New images will automatically use Gcore CDN. Existing images continue to work.

## Need Help?

- Check logs: `npx supabase functions logs gcore-upload --project-ref cesmsdnblkdjkskmiqib`
- See full guide: `GCORE_CDN_SETUP.md`
- Implementation details: `GCORE_CDN_IMPLEMENTATION_SUMMARY.md`
