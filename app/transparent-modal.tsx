
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PeopleGraph } from '@/components/PeopleGraph';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';

interface Person {
  id: string;
  person_name: string;
  photo_url?: string | null;
}

export default function TransparentModal() {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPeople = async () => {
      if (!params.peopleIds || !user) {
        console.log('[TransparentModal] No peopleIds or user, closing');
        router.back();
        return;
      }

      try {
        const peopleIds = (params.peopleIds as string).split(',');
        console.log('[TransparentModal] Loading people:', peopleIds);

        const { data, error } = await supabase
          .from('persons')
          .select('id, person_name, photo_url')
          .in('id', peopleIds)
          .eq('user_id', user.id);

        if (error) {
          console.error('[TransparentModal] Error loading people:', error);
          router.back();
          return;
        }

        if (data && data.length > 0) {
          console.log('[TransparentModal] Loaded people:', data);
          setPeople(data);
        } else {
          console.log('[TransparentModal] No people found, closing');
          router.back();
        }
      } catch (error) {
        console.error('[TransparentModal] Error:', error);
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadPeople();
  }, [params.peopleIds, user]);

  const handleClose = () => {
    console.log('[TransparentModal] Closing');
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (people.length === 0) {
    return null;
  }

  return (
    <PeopleGraph
      people={people}
      onClose={handleClose}
      anchorPosition={{ x: 0, y: 0 }}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
