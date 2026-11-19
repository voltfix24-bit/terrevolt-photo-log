import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UrlStation } from "@/lib/urls";

const KEY = "url-index-v1";
type Index = { stations: UrlStation[]; opdrachtgevers: string[] };

function cached(): Index | undefined {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : undefined; } catch { return undefined; }
}

/** Kleine index van alle stations + opdrachtgevers om urls op te lossen; offline uit de lokale cache. */
export function useUrlIndex() {
  return useQuery({
    queryKey: ["url-index"],
    queryFn: async (): Promise<Index> => {
      try {
        const [st, og] = await Promise.all([
          supabase.from("stations").select("id, casenummer, casenaam, opdrachtgever, behuizingsnummer, naam_msr, datum, submitted_at, created_at, status"),
          supabase.from("opdrachtgevers").select("naam"),
        ]);
        if (st.error || og.error) throw st.error ?? og.error;
        const idx = { stations: st.data ?? [], opdrachtgevers: (og.data ?? []).map((o) => o.naam) };
        try { localStorage.setItem(KEY, JSON.stringify(idx)); } catch { /* */ }
        return idx;
      } catch (e) {
        const c = cached();
        if (c) return c;
        throw e;
      }
    },
    initialData: cached,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });
}
