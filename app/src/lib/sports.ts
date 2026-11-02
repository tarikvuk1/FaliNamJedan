import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Sport = { id: number; slug: string; name: string };

export function useSports() {
  const [sports, setSports] = useState<Sport[]>([]);
  useEffect(() => {
    supabase.from('sports').select('id, slug, name').order('id')
      .then(({ data }) => setSports(data ?? []));
  }, []);
  return sports;
}