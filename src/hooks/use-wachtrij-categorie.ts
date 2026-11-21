import { useCallback, useEffect, useRef, useState } from "react";
import { getCategorieItems, QUEUE_EVENT, type QueueStatus } from "@/lib/offline-queue";

export type WachtrijFoto = { id: string; pad?: string; url: string; status: QueueStatus; fout?: string; beheer: boolean; fileName: string };

// Gedeelde object-URL's per queue-ID met referentietelling: remounts en categoriewissels houden
// dezelfde preview, en een URL wordt pas ingetrokken als niemand hem meer toont.
const urls = new Map<string, { url: string; refs: number }>();
function pak(id: string, blob: Blob): string {
  const e = urls.get(id);
  if (e) { e.refs++; return e.url; }
  const url = URL.createObjectURL(blob);
  urls.set(id, { url, refs: 1 });
  return url;
}
function laat(id: string) {
  const e = urls.get(id);
  if (!e) return;
  e.refs--;
  // Uitgesteld, zodat een directe remount dezelfde URL kan hergebruiken.
  if (e.refs <= 0) setTimeout(() => { const n = urls.get(id); if (n && n.refs <= 0) { URL.revokeObjectURL(n.url); urls.delete(id); } }, 1000);
}
export const _previewUrls = urls;

/** Duurzame wachtrijstatus van één categorie; laadt alleen de blobs van deze categorie. */
export function useWachtrijCategorie(stationId: string | undefined, categorie: string | undefined) {
  const [items, setItems] = useState<WachtrijFoto[]>([]);
  const [leesFout, setLeesFout] = useState(false);
  const vast = useRef<Set<string>>(new Set());

  const laad = useCallback(async () => {
    if (!stationId || !categorie) { setItems([]); return; }
    try {
      const rijen = await getCategorieItems(stationId, categorie);
      rijen.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
      const nu = new Set(rijen.map((r) => r.id));
      for (const r of rijen) if (!vast.current.has(r.id)) { pak(r.id, r.file); vast.current.add(r.id); }
      for (const id of [...vast.current]) if (!nu.has(id)) { laat(id); vast.current.delete(id); }
      setItems(rijen.map((r) => ({ id: r.id, pad: r.pad, url: urls.get(r.id)!.url, status: r.status, fout: r.laatsteFout, beheer: r.foutSoort === "beheer", fileName: r.fileName })));
      setLeesFout(false);
    } catch { setLeesFout(true); }
  }, [stationId, categorie]);

  useEffect(() => {
    void laad();
    const h = () => void laad();
    window.addEventListener(QUEUE_EVENT, h);
    const set = vast.current;
    return () => { window.removeEventListener(QUEUE_EVENT, h); for (const id of set) laat(id); set.clear(); };
  }, [laad]);

  return { items, leesFout, herlaad: laad };
}

export const STATUS_TEKST: Record<QueueStatus | "server", { tekst: string; icoon: string }> = {
  pending: { tekst: "Bewaard op dit toestel", icoon: "smartphone" },
  uploading: { tekst: "Bezig met versturen", icoon: "cloud_upload" },
  done: { tekst: "Verstuurd", icoon: "cloud_done" },
  server: { tekst: "Verstuurd", icoon: "cloud_done" },
  error: { tekst: "Versturen mislukt — opnieuw proberen", icoon: "error" },
};
