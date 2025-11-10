
# Location API Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Option 1: Use Google Places API (Recommended)

1. **Get API Key** (2 minutes)
   ```
   1. Go to: https://console.cloud.google.com/
   2. Create new project
   3. Enable "Places API (New)" and "Geocoding API"
   4. Create API key
   ```

2. **Add to App** (1 minute)
   ```typescript
   // Open: utils/googlePlaces.ts
   // Replace this line:
   const GOOGLE_PLACES_API_KEY = 'YOUR_GOOGLE_PLACES_API_KEY';
   
   // With your actual key:
   const GOOGLE_PLACES_API_KEY = 'AIzaSyD...your-key-here';
   ```

3. **Test** (2 minutes)
   ```
   1. Run app
   2. Create/edit note
   3. Tap location icon
   4. Search for a place
   5. ✅ Should see Google results
   ```

### Option 2: Use OpenStreetMap (No Setup)

Just run the app! It works out of the box with OpenStreetMap.

## 📱 Usage

### Search for Location

```typescript
// In your component:
import { searchPlaces } from '@/utils/googlePlaces';

const results = await searchPlaces('Sydney Opera House', userLocation);
// Returns: Array of PlaceResult objects
```

### Reverse Geocode

```typescript
// In your component:
import { reverseGeocode } from '@/utils/supabase';

const locationName = await reverseGeocode(-33.8688, 151.2093);
// Returns: "Sydney, New South Wales"
```

### Format Location Name

```typescript
// In your component:
import { extractShortLocationName } from '@/utils/googlePlaces';

const short = extractShortLocationName('123 Main St, Sydney, NSW 2000, Australia');
// Returns: "Sydney, NSW"
```

## 🔧 Configuration

### Change Search Region

```typescript
// In utils/googlePlaces.ts, searchPlaces function:
regionCode: 'AU',  // Change to 'US', 'GB', 'CA', etc.
```

### Adjust Search Radius

```typescript
// In utils/googlePlaces.ts, searchPlaces function:
radius: 50000.0,  // Change to desired radius in meters
```

### Change Result Count

```typescript
// In utils/googlePlaces.ts, searchPlaces function:
maxResultCount: 10,  // Change to 1-20
```

## 🐛 Troubleshooting

### "API Not Configured" Error

**Fix**: Add your API key to `utils/googlePlaces.ts`

### "Search Error" Alert

**Check**:
- ✅ APIs enabled in Google Cloud Console
- ✅ API key is correct
- ✅ Internet connection working
- ✅ Check console logs for details

### No Results

**Try**:
- More specific search terms
- Check region code matches your location
- Verify place actually exists

## 💰 Costs

**Free Tier**: $200/month credit

**Typical Usage**:
- 100 searches/month = ~$3.70 (FREE)
- 500 searches/month = ~$18.50 (FREE)
- 1000 searches/month = ~$37.00 ($37 after credit)

**Most users stay FREE** ✅

## 🔐 Security

### Development
```typescript
// OK for development:
const GOOGLE_PLACES_API_KEY = 'AIzaSyD...';
```

### Production
```typescript
// Better for production:
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
```

**Don't commit API keys to Git!**

## 📊 API Comparison

| Feature | Google Places | OpenStreetMap |
|---------|--------------|---------------|
| Setup | 5 minutes | 0 minutes |
| Cost | Free tier | Always free |
| Quality | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Speed | Fast | Good |
| POIs | Excellent | Good |

## 🎯 Best Practices

1. **Always handle errors**
   ```typescript
   try {
     const results = await searchPlaces(query);
   } catch (error) {
     console.error('Search failed:', error);
     // Show user-friendly message
   }
   ```

2. **Cache results when possible**
   ```typescript
   const cache = new Map();
   if (cache.has(query)) {
     return cache.get(query);
   }
   const results = await searchPlaces(query);
   cache.set(query, results);
   ```

3. **Debounce search input**
   ```typescript
   useEffect(() => {
     const timer = setTimeout(() => {
       performSearch(query);
     }, 500); // Wait 500ms after user stops typing
     return () => clearTimeout(timer);
   }, [query]);
   ```

4. **Show loading states**
   ```typescript
   const [loading, setLoading] = useState(false);
   
   const search = async () => {
     setLoading(true);
     try {
       const results = await searchPlaces(query);
       setResults(results);
     } finally {
       setLoading(false);
     }
   };
   ```

## 📚 API Reference

### `searchPlaces(query, userLocation?)`

Search for places by text query.

**Parameters**:
- `query: string` - Search text
- `userLocation?: {latitude, longitude}` - Optional user location for proximity

**Returns**: `Promise<PlaceResult[]>`

**Example**:
```typescript
const results = await searchPlaces('coffee shop', {
  latitude: -33.8688,
  longitude: 151.2093
});
```

### `reverseGeocodeGoogle(latitude, longitude)`

Convert coordinates to location name.

**Parameters**:
- `latitude: number` - Latitude coordinate
- `longitude: number` - Longitude coordinate

**Returns**: `Promise<string>`

**Example**:
```typescript
const name = await reverseGeocodeGoogle(-33.8688, 151.2093);
// Returns: "Sydney, New South Wales"
```

### `extractShortLocationName(address)`

Shorten a full address to "Suburb, City" format.

**Parameters**:
- `address: string` - Full formatted address

**Returns**: `string`

**Example**:
```typescript
const short = extractShortLocationName('123 Main St, Sydney, NSW 2000');
// Returns: "Sydney, NSW"
```

### `isGooglePlacesConfigured()`

Check if Google Places API key is set.

**Returns**: `boolean`

**Example**:
```typescript
if (isGooglePlacesConfigured()) {
  // Use Google Places
} else {
  // Use fallback
}
```

## 🔗 Useful Links

- [Google Cloud Console](https://console.cloud.google.com/)
- [Places API Docs](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Geocoding API Docs](https://developers.google.com/maps/documentation/geocoding/overview)
- [API Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)

## 💡 Tips

1. **Test without API key first** - The app works with OpenStreetMap by default
2. **Monitor usage** - Set up billing alerts in Google Cloud Console
3. **Restrict API key** - Add application restrictions for security
4. **Use environment variables** - Don't hardcode keys in production
5. **Cache common searches** - Reduce API calls and costs

## ✅ Checklist

Before deploying:

- [ ] API key added to app
- [ ] APIs enabled in Google Cloud Console
- [ ] API key restrictions configured
- [ ] Billing alerts set up
- [ ] Error handling tested
- [ ] Fallback behavior verified
- [ ] Search functionality tested
- [ ] Location display tested

## 🎉 You're Done!

Your location search is now powered by Google Places API with automatic fallback to OpenStreetMap. Enjoy better search results! 🚀
