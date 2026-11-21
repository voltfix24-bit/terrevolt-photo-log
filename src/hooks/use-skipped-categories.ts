import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fotowerkVoorActie } from "@/lib/require-pin";
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

  const addSkip = useCallback(async (catName: string, reason?: string): Promise<boolean> => {
    if (!stationId || !reason?.trim() || !internetVereist() || !await fotowerkVoorActie(stationId)) return false;
    const { data, error } = await supabase.from('categorie_skips').upsert({ station_id: stationId, categorie: catName, reden: reason.trim() }, { onConflict: 'station_id,categorie' }).select('id');
    if (error || !data?.length) { toast.error("N.v.t. niet opgeslagen — controleer de beheerstatus"); return false; }
    setSkipped(prev => prev.includes(catName) ? prev : [...prev, catName]);
    setSkippedReasons(prev => ({ ...prev, [catName]: reason.trim() }));
    await queryClient.invalidateQueries({ queryKey: ['categorie-skips', stationId] });
    return true;
  }, [queryClient, setSkipped, stationId]);

  const removeSkip = useCallback(async (catName: string): Promise<boolean> => {
    if (!stationId || !internetVereist() || !await fotowerkVoorActie(stationId)) return false;
    const { error } = await supabase.from('categorie_skips').delete().eq('station_id', stationId).eq('categorie', catName);
    if (error) { toast.error("N.v.t. niet gewijzigd — controleer de beheerstatus"); return false; }
    // Re-read the authoritative result: RLS may return zero deleted rows without error.
    const check = await supabase.from('categorie_skips').select('id').eq('station_id', stationId).eq('categorie', catName);
    if (check.error || check.data?.length) { toast.error("N.v.t. niet gewijzigd — controleer de beheerstatus"); return false; }
    setSkipped(prev => prev.filter(n => n !== catName));
    setSkippedReasons(prev => { const next = { ...prev }; delete next[catName]; return next; });
    await queryClient.invalidateQueries({ queryKey: ['categorie-skips', stationId] });
    return true;
  }, [queryClient, setSkipped, stationId]);

  const toggleSkip = useCallback(async (catName: string) => {
    if (skipped.includes(catName)) return removeSkip(catName);
    toast.error("Geef eerst een reden voor N.v.t.");
    return false;
  }, [skipped, removeSkip]);

  const isSkipped = useCallback((catName: string) => skipped.includes(catName), [skipped]);

  return { skipped, skippedReasons, addSkip, removeSkip, toggleSkip, isSkipped };
}
