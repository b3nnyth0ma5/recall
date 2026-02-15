
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { noteCache, imageCache, peopleCache, CostCalculator } from '@/utils/memoryCache';
import * as Location from 'expo-location';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, saveSearchHistory } from '@/utils/supabase';

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState<string | null>(null);
  const [searchConfidence, setSearchConfidence] = useState<number | undefined>(undefined);
  const [locationInfo, setLocationInfo] = useState<any>(null);
  const [personInfo, setPersonInfo] = useState<any>(null);
  const [searchStage, setSearchStage] = useState<'idle' | 'resolving' | 'people' | 'keywords' | 'searching' | 'complete'>('idle');
  const [searchLocationName, setSearchLocationName] = useState<string | undefined>(undefined);
  const [searchPersonNames, setSearchPersonNames] = useState<string[] | undefined>(undefined);
  const [searchExtractedKeywords, setSearchExtractedKeywords] = useState<string[] | undefined>(undefined);
  const [searchTimeMs, setSearchTimeMs] = useState<number | undefined>(undefined);
  const [searchTimings, setSearchTimings] = useState<any>(undefined);

  const fetchNotes = useCallback(async () => {
    if (!user) {
      console.log('[useNotes] No user, skipping fetch');
      return;
    }

    console.log('[useNotes] Fetching notes for user:', user.id);
    setLoading(true);

    try {
      const cachedNotes = noteCache.getAll();
      if (cachedNotes.length > 0) {
        console.log('[useNotes] Using cached notes:', cachedNotes.length);
        setNotes(cachedNotes);
        setLoading(false);
        return;
      }

      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select('*')
        .eq('user_id', user.id)
        .order('recall_date', { ascending: false });

      if (recallsError) {
        console.error('[useNotes] Error fetching recalls:', recallsError);
        setLoading(false);
        return;
      }

      if (!recallsData || recallsData.length === 0) {
        console.log('[useNotes] No recalls found');
        setNotes([]);
        setLoading(false);
        return;
      }

      const recallIds = recallsData.map((recall: any) => recall.id);

      const [imagesResult, peopleResult] = await Promise.all([
        supabase
          .from('recall_images')
          .select('*')
          .in('recall_id', recallIds)
          .eq('user_id', user.id),
        supabase
          .from('recall_people')
          .select('*, persons(*)')
          .in('recall_id', recallIds)
          .eq('user_id', user.id)
      ]);

      const imagesByRecall = new Map<string, any[]>();
      if (imagesResult.data) {
        for (const image of imagesResult.data) {
          if (!imagesByRecall.has(image.recall_id)) {
            imagesByRecall.set(image.recall_id, []);
          }
          imagesByRecall.get(image.recall_id)!.push(image);
        }
      }

      const peopleByRecall = new Map<string, any[]>();
      if (peopleResult.data) {
        for (const rp of peopleResult.data) {
          if (!peopleByRecall.has(rp.recall_id)) {
            peopleByRecall.set(rp.recall_id, []);
          }
          peopleByRecall.get(rp.recall_id)!.push(rp.persons);
        }
      }

      const notesWithDetails: Note[] = recallsData.map((recall: any) => {
        const images = imagesByRecall.get(recall.id) || [];
        const people = peopleByRecall.get(recall.id) || [];

        const imageUrls = images.map((img: any) => img.cdn_url || '');

        return {
          id: recall.id,
          text: recall.text || '',
          images: imageUrls,
          location: recall.location || undefined,
          location_primary_type: recall.location_primary_type || undefined,
          latitude: recall.latitude || undefined,
          longitude: recall.longitude || undefined,
          created_at: recall.created_at,
          recall_date: recall.recall_date,
          people: people.map((p: any) => ({
            id: p.id,
            name: p.person_name,
            avatar_url: p.photo_url || undefined
          }))
        };
      });

      noteCache.setAll(notesWithDetails);
      setNotes(notesWithDetails);
    } catch (error) {
      console.error('[useNotes] Error in fetchNotes:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const searchNotes = useCallback(async (query: string, saveHistory: boolean = false) => {
    if (!user) {
      console.log('[useNotes] No user, skipping search');
      return;
    }

    if (!query.trim()) {
      console.log('[useNotes] Empty query, fetching all notes');
      await fetchNotes();
      setSearchAnswer(null);
      setSearchConfidence(undefined);
      setLocationInfo(null);
      setPersonInfo(null);
      setSearchStage('idle');
      setSearchLocationName(undefined);
      setSearchPersonNames(undefined);
      setSearchExtractedKeywords(undefined);
      setSearchTimeMs(undefined);
      setSearchTimings(undefined);
      return;
    }

    console.log('[useNotes] Searching with query:', query);
    setLoading(true);
    setSearchStage('resolving');
    setSearchAnswer(null);
    setSearchConfidence(undefined);
    setLocationInfo(null);
    setPersonInfo(null);
    setSearchLocationName(undefined);
    setSearchPersonNames(undefined);
    setSearchExtractedKeywords(undefined);
    setSearchTimeMs(undefined);
    setSearchTimings(undefined);

    try {
      const searchStartTime = Date.now();

      // Get user location for "near me" queries
      let userLocation: { latitude: number; longitude: number } | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          userLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          };
        }
      } catch (error) {
        console.log('[useNotes] Could not get user location:', error);
      }

      // Call the new search-recalls-v3 edge function
      console.log('[useNotes] Calling search-recalls-v3 edge function...');
      
      const { data: searchData, error: searchError } = await supabase.functions.invoke('search-recalls-v3', {
        body: {
          query,
          userLocation
        }
      });

      if (searchError) {
        console.error('[useNotes] Search error:', searchError);
        setNotes([]);
        setSearchStage('complete');
        setLoading(false);
        return;
      }

      console.log('[useNotes] Search completed:', searchData);

      // Extract results
      const { answer, confidence, results, locationInfo: locInfo, personInfo: persInfo, extractedKeywords, timings } = searchData;

      // Update search metadata
      setSearchAnswer(answer);
      setSearchConfidence(confidence);
      setLocationInfo(locInfo);
      setPersonInfo(persInfo);
      setSearchLocationName(locInfo?.resolvedPlace);
      setSearchPersonNames(persInfo?.matchedNames);
      setSearchExtractedKeywords(extractedKeywords);
      setSearchTimeMs(timings?.totalMs);
      setSearchTimings(timings);

      // Update stage indicators
      setSearchStage('complete');

      // Fetch full note details for matching recalls
      if (results && results.length > 0) {
        const recallIds = results.map((r: any) => r.id);

        const { data: recallsData, error: recallsError } = await supabase
          .from('recalls')
          .select('*')
          .in('id', recallIds)
          .eq('user_id', user.id);

        if (recallsError) {
          console.error('[useNotes] Error fetching recall details:', recallsError);
          setNotes([]);
          setLoading(false);
          return;
        }

        if (!recallsData || recallsData.length === 0) {
          setNotes([]);
          setLoading(false);
          return;
        }

        const [imagesResult, peopleResult] = await Promise.all([
          supabase
            .from('recall_images')
            .select('*')
            .in('recall_id', recallIds)
            .eq('user_id', user.id),
          supabase
            .from('recall_people')
            .select('*, persons(*)')
            .in('recall_id', recallIds)
            .eq('user_id', user.id)
        ]);

        const imagesByRecall = new Map<string, any[]>();
        if (imagesResult.data) {
          for (const image of imagesResult.data) {
            if (!imagesByRecall.has(image.recall_id)) {
              imagesByRecall.set(image.recall_id, []);
            }
            imagesByRecall.get(image.recall_id)!.push(image);
          }
        }

        const peopleByRecall = new Map<string, any[]>();
        if (peopleResult.data) {
          for (const rp of peopleResult.data) {
            if (!peopleByRecall.has(rp.recall_id)) {
              peopleByRecall.set(rp.recall_id, []);
            }
            peopleByRecall.get(rp.recall_id)!.push(rp.persons);
          }
        }

        const notesWithDetails: Note[] = recallsData.map((recall: any) => {
          const images = imagesByRecall.get(recall.id) || [];
          const people = peopleByRecall.get(recall.id) || [];
          const resultInfo = results.find((r: any) => r.id === recall.id);

          const imageUrls = images.map((img: any) => img.cdn_url || '');

          return {
            id: recall.id,
            text: recall.text || '',
            images: imageUrls,
            location: recall.location || undefined,
            location_primary_type: recall.location_primary_type || undefined,
            latitude: recall.latitude || undefined,
            longitude: recall.longitude || undefined,
            created_at: recall.created_at,
            recall_date: recall.recall_date,
            people: people.map((p: any) => ({
              id: p.id,
              name: p.person_name,
              avatar_url: p.photo_url || undefined
            })),
            used_for_answer: resultInfo?.usedForAnswer || false
          };
        });

        // Sort notes to match the order from search results
        const orderedNotes = recallIds
          .map((id: string) => notesWithDetails.find(note => note.id === id))
          .filter((note): note is Note => note !== undefined);

        setNotes(orderedNotes);
      } else {
        setNotes([]);
      }

      // Save search history if requested
      if (saveHistory) {
        try {
          await saveSearchHistory(user.id, query);
          console.log('[useNotes] Search history saved');
        } catch (error) {
          console.error('[useNotes] Error saving search history:', error);
        }
      }

      const searchEndTime = Date.now();
      console.log(`[useNotes] Search completed in ${searchEndTime - searchStartTime}ms`);
    } catch (error) {
      console.error('[useNotes] Error in searchNotes:', error);
      setNotes([]);
      setSearchStage('complete');
    } finally {
      setLoading(false);
    }
  }, [user, fetchNotes]);

  const getSearchHistory = useCallback(async () => {
    if (!user) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[useNotes] Error fetching search history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[useNotes] Error in getSearchHistory:', error);
      return [];
    }
  }, [user]);

  const getCachedNote = useCallback((noteId: string): Note | null => {
    return noteCache.get(noteId);
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotes();
    }
  }, [user, fetchNotes]);

  return {
    notes,
    loading,
    fetchNotes,
    searchNotes,
    getSearchHistory,
    getCachedNote,
    searchAnswer,
    searchConfidence,
    locationInfo,
    personInfo,
    searchStage,
    searchLocationName,
    searchPersonNames,
    searchExtractedKeywords,
    searchTimeMs,
    searchTimings,
  };
}
