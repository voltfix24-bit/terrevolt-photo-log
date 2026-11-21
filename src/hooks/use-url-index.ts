import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UUID_RE, zoekOpCaseSlug, zoekOpStationSlug, opdrachtgeverSlug, slug, type UrlStation } from "@/lib/urls";

const KEY = "url-index-v2"; // v2: met uitvoerder
type Index = { stations: UrlStation[]; opdrachtgevers: string[] };

function cached(): Index | undefined {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : undefined; } catch { return undefined; }
}

/** Cold links fetch candidates only. The existing cache is merged, not discarded. */
export function useUrlIndex(key?: string, og?: string) {
  const lokaal = () => {
    const idx = cached();
    if (!idx) return undefined;
    const stations = key ? (UUID_RE.test(key) ? idx.stations.filter(s => s.id === key) : [...new Map([...zoekOpCaseSlug(idx.stations,key), zoekOpStationSlug(idx.stations,key)].filter((s): s is UrlStation => !!s).map(s => [s.id,s])).values()]) : idx.stations.filter(s => og && opdrachtgeverSlug(s) === slug(og));
    return stations.length ? { ...idx, stations } : undefined;
  };
  return useQuery({
    queryKey: ["url-index", key ?? null, og ?? null],
    queryFn: async (): Promise<Index> => {
      try {
        let stations: UrlStation[] = [];
        if (key && UUID_RE.test(key)) {
          const { data, error } = await supabase.from("stations").select("id, casenummer, casenaam, opdrachtgever, behuizingsnummer, naam_msr, datum, submitted_at, created_at, uitvoerder").eq("id",key).maybeSingle();
          if (error) throw error;
          stations = data ? [data] : [];
        } else {
          for (let offset=0;;offset+=250) {
            const { data,error } = await supabase.rpc("url_candidates", { _key: key, _og: og }).range(offset,offset+249);
            if (error) throw error;
            stations.push(...(data ?? []));
            if ((data?.length ?? 0)<250) break;
          }
        }
        let opdrachtgevers: string[] = [];
        if (og) {
          const { data,error } = await supabase.from("opdrachtgevers").select("naam");
          if (error) throw error;
          opdrachtgevers = (data ?? []).map(o => o.naam);
        }
        const idx = { stations, opdrachtgevers };
        const old = cached();
        try { localStorage.setItem(KEY, JSON.stringify({ stations: [...new Map([...(old?.stations ?? []),...stations].map(s => [s.id,s])).values()], opdrachtgevers: [...new Set([...(old?.opdrachtgevers ?? []),...opdrachtgevers])] })); } catch { /* cache optional */ }
        return idx;
      } catch(e) { const idx = lokaal(); if (!navigator.onLine && idx) return idx; throw e; }
    },
    initialData: lokaal, initialDataUpdatedAt: 0, staleTime: 30_000,
  });
}
