
# Google Places API Setup Guide

This guide will help you set up the Google Places API for the location search functionality in your app.

## Overview

The app now uses Google Places API for location search and reverse geocoding, which provides:

- More accurate location results
- Better place information
- Proximity-based sorting
- Support for landmarks and points of interest
- Consistent formatting across different regions

## Prerequisites

- A Google Cloud Platform account
- A credit card (required for Google Cloud, but the free tier is generous)

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "Recalls App")
5. Click "Create"

### 2. Enable Required APIs

You need to enable two APIs:

#### Enable Places API (New)

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Places API (New)"
3. Click on it and click "Enable"

#### Enable Geocoding API

1. In the API Library, search for "Geocoding API"
2. Click on it and click "Enable"

### 3. Create an API Key

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Your API key will be created and displayed
4. **Important**: Click "Restrict Key" to secure it

### 4. Restrict Your API Key (Recommended)

For security, you should restrict your API key:

#### Application Restrictions

- For development: Choose "None" (but remember to restrict for production)
- For production mobile apps: Choose "iOS apps" or "Android apps" and add your bundle ID/package name

#### API Restrictions

1. Select "Restrict key"
2. Check these APIs:
   - Places API (New)
   - Geocoding API
3. Click "Save"

### 5. Add API Key to Your App

1. Open `utils/googlePlaces.ts` in your project
2. Find this line:
   ```typescript
   const GOOGLE_PLACES_API_KEY = 'YOUR_GOOGLE_PLACES_API_KEY';
   ```
3. Replace `'YOUR_GOOGLE_PLACES_API_KEY'` with your actual API key:
   ```typescript
   const GOOGLE_PLACES_API_KEY = 'AIzaSyD...your-actual-key-here';
   ```
4. Save the file

### 6. Test the Integration

1. Run your app
2. Create or edit a note
3. Tap the location icon in the toolbar
4. Try searching for a location
5. You should see results from Google Places API

## Pricing

Google Places API has a generous free tier:

- **Places API (New) - Text Search**: $32 per 1,000 requests
- **Geocoding API**: $5 per 1,000 requests
- **Free tier**: $200 credit per month

For a typical user:
- 100 location searches per month = ~$3.20
- 100 reverse geocodes per month = ~$0.50
- **Total**: ~$3.70/month (covered by free tier)

Most users will stay well within the free tier.

## Fallback Behavior

The app includes a fallback mechanism:

1. **If Google Places API is configured**: Uses Google Places API
2. **If not configured or fails**: Falls back to OpenStreetMap Nominatim (free, no API key required)

This ensures the app continues to work even if:
- The API key is not configured
- The API quota is exceeded
- There's a network issue with Google's servers

## Troubleshooting

### "API Not Configured" Error

**Problem**: The app shows an error that the API is not configured.

**Solution**: 
- Make sure you've added your API key to `utils/googlePlaces.ts`
- The key should not be `'YOUR_GOOGLE_PLACES_API_KEY'`
- Restart the app after adding the key

### "Search Error" Alert

**Problem**: Search fails with an error message.

**Solutions**:
1. Check that both APIs are enabled in Google Cloud Console
2. Verify your API key is correct
3. Check that your API key restrictions allow the APIs
4. Ensure you have internet connectivity
5. Check the console logs for detailed error messages

### No Results Found

**Problem**: Search returns no results.

**Solutions**:
1. Try a more specific search query
2. Check that you're searching for real places
3. The API is restricted to Australia by default - modify `regionCode` in `utils/googlePlaces.ts` if needed

### API Key Restrictions

If you've restricted your API key by IP address or referrer, you may need to:
- For development: Use "None" for application restrictions
- For production: Add your app's bundle ID (iOS) or package name (Android)

## Customization

### Change Region

By default, the search is restricted to Australia. To change this:

1. Open `utils/googlePlaces.ts`
2. Find the `searchPlaces` function
3. Change `regionCode: 'AU'` to your desired country code (e.g., `'US'`, `'GB'`, `'CA'`)

### Adjust Search Radius

To change the proximity bias radius:

1. Open `utils/googlePlaces.ts`
2. Find `radius: 50000.0` (50km)
3. Change to your desired radius in meters

### Modify Result Count

To change the number of results:

1. Open `utils/googlePlaces.ts`
2. Find `maxResultCount: 10`
3. Change to your desired number (max 20)

## Security Best Practices

1. **Never commit API keys to version control**
   - Add `utils/googlePlaces.ts` to `.gitignore` if it contains your key
   - Or use environment variables

2. **Use API key restrictions**
   - Restrict by application (bundle ID/package name)
   - Restrict by API (only enable what you need)

3. **Monitor usage**
   - Set up billing alerts in Google Cloud Console
   - Monitor your API usage regularly

4. **For production apps**
   - Consider using a backend proxy to hide your API key
   - Implement rate limiting
   - Use Firebase Remote Config or similar to manage keys

## Support

If you encounter issues:

1. Check the console logs in your app
2. Review the [Google Places API documentation](https://developers.google.com/maps/documentation/places/web-service/overview)
3. Check the [Google Cloud Console](https://console.cloud.google.com/) for API errors
4. Verify your billing is set up correctly

## Additional Resources

- [Google Places API (New) Documentation](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Geocoding API Documentation](https://developers.google.com/maps/documentation/geocoding/overview)
- [Google Cloud Console](https://console.cloud.google.com/)
- [API Key Best Practices](https://developers.google.com/maps/api-security-best-practices)
