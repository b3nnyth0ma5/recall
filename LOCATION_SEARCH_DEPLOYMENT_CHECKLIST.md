
# Location-Based Search - Deployment Checklist

Use this checklist to ensure proper deployment of the location-based search feature.

## Pre-Deployment

### 1. Environment Setup

- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Logged into Supabase CLI (`supabase login`)
- [ ] Project linked (`supabase link --project-ref cesmsdnblkdjkskmiqib`)
- [ ] OpenAI API key obtained
- [ ] Google Places API key obtained
- [ ] Google Places API (New) enabled in Google Cloud Console

### 2. Code Review

- [ ] Edge function code reviewed: `supabase/functions/search-recalls-with-location/index.ts`
- [ ] Client code updated: `hooks/useNotes.ts`
- [ ] UI updated: `app/search.tsx`
- [ ] No TypeScript errors
- [ ] No console errors in development

### 3. Dependencies

- [ ] All required npm packages installed
- [ ] No missing imports
- [ ] Edge function dependencies compatible with Deno

## Deployment Steps

### 1. Set Environment Variables

```bash
# Set OpenAI API Key
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here

# Set Google Places API Key
supabase secrets set GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

- [ ] OPENAI_API_KEY set
- [ ] GOOGLE_PLACES_API_KEY set
- [ ] Verify secrets: `supabase secrets list`

### 2. Deploy Edge Function

```bash
# Deploy the function
supabase functions deploy search-recalls-with-location

# Verify deployment
supabase functions list
```

- [ ] Function deployed successfully
- [ ] Function appears in list
- [ ] No deployment errors

### 3. Verify Existing Functions

Ensure the existing `search-recalls` function is still working:

```bash
# Check if search-recalls is deployed
supabase functions list | grep search-recalls
```

- [ ] `search-recalls` function exists
- [ ] `search-recalls` function is working

## Testing

### 1. Test Edge Function Directly

Test with curl to verify the function works:

```bash
# Get your anon key
ANON_KEY=$(supabase status | grep "anon key" | awk '{print $3}')

# Test with location query
curl -i --location --request POST \
  'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/search-recalls-with-location' \
  --header "Authorization: Bearer $ANON_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"query":"restaurants near Sydney Opera House","limit":10}'

# Test without location query
curl -i --location --request POST \
  'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/search-recalls-with-location' \
  --header "Authorization: Bearer $ANON_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"query":"birthday party","limit":10}'
```

- [ ] Location query returns filtered results
- [ ] Non-location query returns all results
- [ ] Response includes `locationFiltered` field
- [ ] Response includes `locationInfo` when applicable
- [ ] No 500 errors
- [ ] Response time < 5 seconds

### 2. Test in App

Test the search functionality in the mobile app:

**Location-based searches**:
- [ ] "restaurants near Central Park" - filters by location
- [ ] "photos within 10km of Sydney" - filters by distance
- [ ] "notes at the beach" - filters by location context

**Regular searches**:
- [ ] "birthday party" - returns all results
- [ ] "meeting notes" - returns all results

**UI Verification**:
- [ ] AI indicator shows "AI-powered search with NER"
- [ ] Location badge appears when filtering is applied
- [ ] Location badge shows correct place name and proximity
- [ ] Search results are relevant
- [ ] No UI glitches or errors

### 3. Edge Cases

Test edge cases to ensure robustness:

- [ ] Empty query - returns error
- [ ] Very long query - handles gracefully
- [ ] Invalid location - falls back to regular search
- [ ] Ambiguous location - resolves or falls back
- [ ] No recalls with location data - returns empty results
- [ ] Network error - handles gracefully

## Monitoring

### 1. Check Logs

Monitor the function logs for errors:

```bash
# View recent logs
supabase functions logs search-recalls-with-location

# Follow logs in real-time
supabase functions logs search-recalls-with-location --follow
```

- [ ] No error logs
- [ ] NER analysis working correctly
- [ ] Google Places API responding
- [ ] Filtering logic working as expected

### 2. Monitor API Usage

Track API usage to manage costs:

- [ ] OpenAI API usage dashboard checked
- [ ] Google Places API usage dashboard checked
- [ ] Usage within expected limits
- [ ] No unexpected spikes

### 3. Performance Metrics

Monitor performance metrics:

- [ ] Average response time < 3 seconds
- [ ] Location detection rate tracked
- [ ] Google Places success rate tracked
- [ ] Filter effectiveness measured

## Post-Deployment

### 1. Documentation

- [ ] Deployment documented
- [ ] Team notified of new feature
- [ ] User guide shared (if applicable)
- [ ] Known issues documented

### 2. User Communication

- [ ] Users informed of new feature
- [ ] Usage examples provided
- [ ] Feedback mechanism in place

### 3. Monitoring Plan

- [ ] Daily log checks scheduled
- [ ] Weekly usage review scheduled
- [ ] Monthly cost review scheduled
- [ ] Performance alerts configured

## Rollback Plan

If issues arise, follow this rollback procedure:

### 1. Immediate Rollback

```bash
# Revert client code to use old function
# In hooks/useNotes.ts, change back to:
# supabase.functions.invoke('search-recalls', ...)
```

- [ ] Client code reverted
- [ ] App redeployed
- [ ] Users notified

### 2. Function Cleanup

```bash
# Optionally delete the new function
supabase functions delete search-recalls-with-location
```

- [ ] Function deleted (if needed)
- [ ] Secrets cleaned up (if needed)

## Troubleshooting

### Common Issues

**Issue**: Function not found
- **Solution**: Verify deployment with `supabase functions list`
- **Solution**: Redeploy with `supabase functions deploy search-recalls-with-location`

**Issue**: API key errors
- **Solution**: Check secrets with `supabase secrets list`
- **Solution**: Reset secrets with `supabase secrets set`

**Issue**: No location filtering applied
- **Solution**: Check if query has clear location intent
- **Solution**: Verify Google Places API is enabled
- **Solution**: Check function logs for errors

**Issue**: Wrong location resolved
- **Solution**: Use more specific location names
- **Solution**: Add more context to the query

**Issue**: Slow response times
- **Solution**: Check OpenAI API status
- **Solution**: Check Google Places API status
- **Solution**: Review function logs for bottlenecks

## Success Criteria

The deployment is successful when:

- [ ] Edge function deployed and accessible
- [ ] Environment variables configured correctly
- [ ] Location-based searches return filtered results
- [ ] Regular searches work as before
- [ ] UI shows location indicators correctly
- [ ] No errors in logs
- [ ] Response times acceptable (< 3 seconds)
- [ ] API costs within budget
- [ ] User feedback positive

## Sign-Off

- [ ] Technical lead approval
- [ ] QA testing completed
- [ ] Documentation reviewed
- [ ] Deployment completed
- [ ] Monitoring in place

**Deployed by**: _______________
**Date**: _______________
**Version**: 1.0.0

## Notes

Add any deployment notes, issues encountered, or special considerations here:

---

**Next Steps After Deployment**:
1. Monitor logs for the first 24 hours
2. Gather user feedback
3. Track API usage and costs
4. Plan for future enhancements
5. Update documentation based on learnings
