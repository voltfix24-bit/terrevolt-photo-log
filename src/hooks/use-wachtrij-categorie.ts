import { useCallback, useEffect, useRef, useState } from "react";
import { getCategorieItems, QUEUE_EVENT, verwijderVerstuurd, type QueueStatus } from "@/lib/offline-queue";

export type WachtrijFoto = { id: string; pad?: string; url: string; status: QueueStatus; fout?: string; beheer: boolean; fileName: string; timestamp?: string };

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

/**
 * Duurzame wachtrijstatus van één categorie; laadt alleen de blobs van deze categorie.
 * Iedere read is gebonden aan station+categorie en een generatie: een verouderde read (na wissel of
 * unmount) neemt geen state of object-URL-referenties over. Een bevestigd verstuurde foto blijft als
 * "Verstuurd" zichtbaar tot de serverlijst hetzelfde pad bevat, ook als de wachtrij hem al opruimde.
 */
export function useWachtrijCategorie(stationId: string | undefined, categorie: string | undefined, serverPaden?: ReadonlySet<string>) {
  const sleutel = stationId && categorie ? `${stationId}\u0000${categorie}` : "";
  const [staat, setStaat] = useState<{ sleutel: string; items: WachtrijFoto[] }>({ sleutel: "", items: [] });
  const [leesFout, setLeesFout] = useState(false);
  const vast = useRef<Set<string>>(new Set());
  const bewaardVerstuurd = useRef<Map<string, WachtrijFoto>>(new Map());
  const generatie = useRef(0);
  const serverRef = useRef(serverPaden);
  serverRef.current = serverPaden;

  const laad = useCallback(async () => {
    const gen = ++generatie.current;
    if (!stationId || !categorie) { setStaat({ sleutel: "", items: [] }); return; }
    try {
      const alle = await getCategorieItems(stationId, categorie);
      if (gen !== generatie.current) return; // verouderd: niets overnemen
      // Verstuurde items blijven duurzaam in de wachtrij tot de serverlijst hetzelfde pad bevat;
      // pas dan worden ze (atomair, alleen als nog 'done' met dit pad) opgeruimd.
      const rijen = alle.filter((r) => {
        if (r.status === "done" && r.pad && serverRef.current?.has(r.pad)) { void verwijderVerstuurd(r.id, r.pad).catch(() => {}); return false; }
        return true;
      });
      rijen.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
      const nu = new Set(rijen.map((r) => r.id));
      for (const r of rijen) if (!vast.current.has(r.id)) { pak(r.id, r.file); vast.current.add(r.id); }
      const lijst: WachtrijFoto[] = rijen.map((r) => ({ id: r.id, pad: r.pad, url: urls.get(r.id)!.url, status: r.status, fout: r.laatsteFout, beheer: r.foutSoort === "beheer", fileName: r.fileName, timestamp: r.timestamp }));
      for (const w of lijst) if (w.status === "done") bewaardVerstuurd.current.set(w.id, w);
      for (const id of [...vast.current]) {
        if (nu.has(id)) continue;
        const oud = bewaardVerstuurd.current.get(id);
        if (oud && !(oud.pad && serverRef.current?.has(oud.pad))) continue; // nog niet in serverlijst: tegel houden
        bewaardVerstuurd.current.delete(id); laat(id); vast.current.delete(id);
      }
      const extra = [...bewaardVerstuurd.current.values()].filter((w) => !nu.has(w.id));
      setStaat({ sleutel: `${stationId}\u0000${categorie}`, items: [...lijst, ...extra].sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? "") || a.id.localeCompare(b.id)) });
      setLeesFout(false);
    } catch { if (gen === generatie.current) setLeesFout(true); }
  }, [stationId, categorie]);

  useEffect(() => {
    void laad();
    const h = () => void laad();
    window.addEventListener(QUEUE_EVENT, h);
    const set = vast.current; const verstuurd = bewaardVerstuurd.current;
    return () => {
      generatie.current++; // lopende reads verouderen (ook bij unmount)
      window.removeEventListener(QUEUE_EVENT, h);
      for (const id of set) laat(id); set.clear(); verstuurd.clear();
    };
  }, [laad]);

  // Zodra de serverlijst een vastgehouden verstuurde foto bevat, verdwijnt de lokale tegel (exact één).
  const serverSleutel = serverPaden ? [...serverPaden].sort().join("|") : "";
  useEffect(() => {
    if (!serverPaden) return;
    let weg = false;
    for (const [id, w] of bewaardVerstuurd.current) if (w.pad && serverPaden.has(w.pad)) { void verwijderVerstuurd(id, w.pad).catch(() => {}); bewaardVerstuurd.current.delete(id); if (vast.current.has(id)) { laat(id); vast.current.delete(id); } weg = true; }
    if (weg) setStaat((s) => ({ ...s, items: s.items.filter((w) => !(w.pad && serverPaden.has(w.pad) && w.status === "done" && !bewaardVerstuurd.current.has(w.id) && !vast.current.has(w.id))) }));
  }, [serverSleutel]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = staat.sleutel === sleutel ? staat.items : [];
  return { items, leesFout, herlaad: laad };
}

export const STATUS_TEKST: Record<QueueStatus | "server", { tekst: string; icoon: string }> = {
  pending: { tekst: "Bewaard op dit toestel", icoon: "smartphone" },
  uploading: { tekst: "Bezig met versturen", icoon: "cloud_upload" },
  done: { tekst: "Verstuurd", icoon: "cloud_done" },
  server: { tekst: "Verstuurd", icoon: "cloud_done" },
  error: { tekst: "Versturen mislukt — opnieuw proberen", icoon: "error" },
};
