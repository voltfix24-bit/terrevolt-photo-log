import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { internetVereist } from "@/lib/internet";

/** N.v.t.-markeringen per station: server (categorie_skips) is leidend, localStorage als snelle cache. */
export function useSkippedCategories(stationId: string | undefined) {
  const key = `skipped-${stationId}`;
  const reasonsKey = `skip-reasons-${stationId}`;
  const queryClient = useQueryClient();
  const [skipped, setSkippedRaw] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [skippedReasons, setSkippedReasons] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(reasonsKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const { data: storedSkips } = useQuery({
    queryKey: ['categorie-skips', stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('categorie_skips').select('categorie, reden').eq('station_id', stationId ?? '');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!stationId,
  });

  useEffect(() => {
    if (!storedSkips) return;
    const names = storedSkips.map(item => item.categorie);
    const reasons = Object.fromEntries(storedSkips.map(item => [item.categorie, item.reden]));
    setSkippedRaw(names);
    setSkippedReasons(reasons);
    try {
      localStorage.setItem(key, JSON.stringify(names));
      localStorage.setItem(reasonsKey, JSON.stringify(reasons));
    } catch { /* */ }
  }, [key, reasonsKey, storedSkips]);

  const setSkipped = useCallback((fn: (prev: string[]) => string[]) => {
    setSkippedRaw(prev => {
      const next = fn(prev);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, [key]);

  const addSkip = useCallback((catName: string, reason?: string) => {
    if (!internetVereist()) return;
    setSkipped(prev => prev.includes(catName) ? prev : [...prev, catName]);
    if (reason) {
      setSkippedReasons(prev => {
        const next = { ...prev, [catName]: reason };
        try { localStorage.setItem(reasonsKey, JSON.stringify(next)); } catch { /* */ }
        return next;
      });
      if (stationId) {
        void supabase.from('categorie_skips').upsert({ station_id: stationId, categorie: catName, reden: reason, updated_at: new Date().toISOString() }, { onConflict: 'station_id,categorie' }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['categorie-skips', stationId] });
        });
      }
    }
  }, [queryClient, reasonsKey, setSkipped, stationId]);

  const removeSkip = useCallback((catName: string) => {
    if (!internetVereist()) return;
    setSkipped(prev => prev.filter(n => n !== catName));
    setSkippedReasons(prev => {
      const next = { ...prev };
      delete next[catName];
      try { localStorage.setItem(reasonsKey, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
    if (stationId) {
      void supabase.from('categorie_skips').delete().eq('station_id', stationId).eq('categorie', catName).then(() => {
        queryClient.invalidateQueries({ queryKey: ['categorie-skips', stationId] });
      });
    }
  }, [queryClient, reasonsKey, setSkipped, stationId]);

  const toggleSkip = useCallback((catName: string) => {
    if (!internetVereist()) return;
    setSkipped(prev =>
      prev.includes(catName)
        ? prev.filter(n => n !== catName)
        : [...prev, catName]
    );
  }, [setSkipped]);

  const isSkipped = useCallback((catName: string) => skipped.includes(catName), [skipped]);

  return { skipped, skippedReasons, addSkip, removeSkip, toggleSkip, isSkipped };
}
