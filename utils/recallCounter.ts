
import { supabase } from './supabase';

/**
 * Get the count of recalls for a specific person
 * @param personId - The ID of the person
 * @param userId - The ID of the user
 * @returns The number of recalls where this person is mentioned
 */
export async function getPersonRecallCount(
  personId: string,
  userId: string
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('recall_people')
      .select('recall_id', { count: 'exact', head: true })
      .eq('person_id', personId)
      .eq('user_id', userId);

    if (error) {
      console.error(`Error loading recall count for person ${personId}:`, error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error(`Error loading recall count for person ${personId}:`, error);
    return 0;
  }
}

/**
 * Get recall counts for multiple people
 * @param people - Array of person objects with id property
 * @param userId - The ID of the user
 * @returns Object mapping person IDs to their recall counts
 */
export async function getMultiplePersonRecallCounts(
  people: { id: string }[],
  userId: string
): Promise<{ [personId: string]: number }> {
  if (!people || people.length === 0) {
    return {};
  }

  const counts: { [personId: string]: number } = {};

  try {
    const personIds = people.map(p => p.id);
    
    // Get recall counts for all people in one query
    const { data: recallPeopleData, error } = await supabase
      .from('recall_people')
      .select('person_id, recall_id')
      .in('person_id', personIds)
      .eq('user_id', userId);

    if (error) {
      console.error('Error loading recall counts:', error);
      return counts;
    }

    // Count recalls per person
    (recallPeopleData || []).forEach((rp: any) => {
      counts[rp.person_id] = (counts[rp.person_id] || 0) + 1;
    });

    console.log('[recallCounter] Loaded recall counts:', counts);
    return counts;
  } catch (error) {
    console.error('Error loading recall counts:', error);
    return counts;
  }
}
