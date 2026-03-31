import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AppInstellingen {
  id: string;
  bedrijfsnaam: string;
  regio: string;
  logo_url: string | null;
  profielfoto_url: string | null;
  primary_color: string;
  primary_light_color: string;
  background_color: string;
  accent_gold_color: string;
  orange_color: string;
}

export const DEFAULT_THEME: Partial<AppInstellingen> = {
  bedrijfsnaam: 'Terrevolt B.V.',
  regio: 'Liander Zuidoost',
  primary_color: '150 100% 20%',
  primary_light_color: '140 65% 66%',
  background_color: '116 90% 96%',
  accent_gold_color: '44 100% 23%',
  orange_color: '15 82% 50%',
};

export function applyTheme(settings: Partial<AppInstellingen>) {
  const root = document.documentElement;
  if (settings.primary_color) {
    root.style.setProperty('--primary', settings.primary_color);
  }
  if (settings.primary_light_color) {
    root.style.setProperty('--primary-light', settings.primary_light_color);
  }
  if (settings.background_color) {
    root.style.setProperty('--background', settings.background_color);
    root.style.setProperty('--surface', settings.background_color);
  }
  if (settings.accent_gold_color) {
    root.style.setProperty('--accent-gold', settings.accent_gold_color);
  }
  if (settings.orange_color) {
    root.style.setProperty('--orange', settings.orange_color);
  }
}

export function useInstellingen() {
  const query = useQuery({
    queryKey: ['instellingen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instellingen')
        .select('*')
        .single();
      if (error) throw error;
      return data as AppInstellingen;
    },
  });

  useEffect(() => {
    if (query.data) {
      applyTheme(query.data);
    }
  }, [query.data]);

  return query;
}
