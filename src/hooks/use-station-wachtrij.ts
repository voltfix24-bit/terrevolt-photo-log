import { useEffect, useState } from "react";
import { getWachtrijSamenvattingVoor, QUEUE_EVENT, type WachtrijSamenvatting } from "@/lib/offline-queue";

/**
 * Lichte wachtrijsamenvatting van één station (Blob-vrij). `samenvatting` is null zolang onbekend;
 * `leesFout` bij ontbrekende IndexedDB-toegang. Responses van een vorig station worden genegeerd.
 */
export function useStationWachtrij(stationId: string | undefined) {
  const [staat, setStaat] = useState<{ id: string; s: WachtrijSamenvatting | null; fout: boolean }>({ id: "", s: null, fout: false });
  useEffect(() => {
    if (!stationId) return;
    let gen = 0; let actief = true;
    const laad = () => {
      const mijn = ++gen;
      getWachtrijSamenvattingVoor(stationId)
        .then((s) => { if (actief && mijn === gen) setStaat({ id: stationId, s, fout: false }); })
        .catch(() => { if (actief && mijn === gen) setStaat({ id: stationId, s: null, fout: true }); });
    };
    laad();
    window.addEventListener(QUEUE_EVENT, laad);
    return () => { actief = false; window.removeEventListener(QUEUE_EVENT, laad); };
  }, [stationId]);
  const huidig = staat.id === stationId;
  return { samenvatting: huidig ? staat.s : null, leesFout: huidig && staat.fout };
}
