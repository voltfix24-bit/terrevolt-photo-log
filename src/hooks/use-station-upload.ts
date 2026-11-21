import { BEHEER_NODIG, fotowerkVoorActie } from "@/lib/require-pin";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { nieuweQueueId, queuePhoto } from "@/lib/offline-queue";
import { verwijderFoto, wachtrijPad } from "@/lib/fotos-service";
import { bereidFotoVoor, syncPendingPhotos } from "@/lib/sync-service";
import { fotoFout } from "@/lib/foto-validatie";
import type { FotoRow } from "@/components/station/types";

/**
 * Foto's van een station: iedere geselecteerde foto wordt eerst eenmalig voorbereid en duurzaam op
 * dit toestel bewaard (vast queue-ID + vast pad), daarna verstuurd door dezelfde wachtrij als offline.
 */
export function useStationUpload(id: string | undefined, opts: {
  beschermd?: boolean;
  fotosByCategorie: (cat: string) => FotoRow[];
  isSkipped: (cat: string) => boolean;
  removeSkip: (cat: string) => void;
}) {
  const queryClient = useQueryClient();
  const [bewaren, setBewaren] = useState<Record<string, number>>({});

  const verstuur = async () => {
    const r = await syncPendingPhotos();
    // Vernieuwen per getroffen station gebeurt centraal via SYNC_RESULTAAT_EVENT (App).
    if (r.mislukt > 0) toast.error(r.fouten.some((f) => /row.level|permission|beheer|42501|pin/i.test(f)) ? `Foto's blijven bewaard op dit toestel. ${BEHEER_NODIG}` : "Versturen mislukt — de foto's blijven bewaard op dit toestel; probeer opnieuw.");
  };

  /** Bestanden, station en categorie zijn bij aanroep al vastgelegd; de native FileList mag direct leeg. */
  const handleUpload = async (categorie: string, invoer: FileList | File[]): Promise<string[]> => {
    const files = Array.from(invoer);
    const stationId = id;
    const mislukt: string[] = [];
    if (!stationId) return files.map((f) => f.name);
    const online = navigator.onLine;
    if (!online && opts.beschermd) { toast.error("Internet en de toegangscode zijn nodig voor dit opgeleverde dossier."); return files.map((f) => f.name); }
    if (online && !await fotowerkVoorActie(stationId)) { toast.error(BEHEER_NODIG); return files.map((f) => f.name); }
    setBewaren((b) => ({ ...b, [categorie]: (b[categorie] ?? 0) + files.length }));
    let bewaard = 0;
    try {
      for (const file of files) {
        try {
          const fout = fotoFout(file);
          if (fout) { toast.error(fout); mislukt.push(file.name); continue; }
          const queueId = nieuweQueueId(stationId);
          const blob = await bereidFotoVoor(file);
          const pad = wachtrijPad(stationId, categorie, queueId, blob, file.name);
          try { await queuePhoto(stationId, categorie, blob, { id: queueId, pad, fileName: file.name }); bewaard++; }
          catch { toast.error(`${file.name} niet bewaard — de opslag van dit toestel is mogelijk vol. Maak ruimte vrij en kies de foto opnieuw.`); mislukt.push(file.name); }
        } finally {
          setBewaren((b) => ({ ...b, [categorie]: Math.max(0, (b[categorie] ?? 1) - 1) }));
        }
      }
    } finally {
      setBewaren((b) => { const n = { ...b }; if (!n[categorie]) delete n[categorie]; return n; });
    }
    // Actuele verbinding ná de duurzame write: online geworden tijdens voorbereiding verstuurt alsnog.
    const nuOnline = navigator.onLine;
    if (bewaard > 0 && !nuOnline) toast.success(`${bewaard} foto${bewaard > 1 ? "'s" : ""} bewaard op dit toestel — wordt verstuurd zodra je online bent`, { duration: 4000 });
    if (bewaard > 0 && nuOnline) void verstuur();
    return mislukt;
  };

  const handleDelete = async (fotoId: string, storagePath: string) => {
    const r = await verwijderFoto(fotoId, storagePath);
    queryClient.invalidateQueries({ queryKey: ["fotos", id] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    if (!r.ok) { toast.error("Foto verwijderen mislukt — probeer opnieuw"); return; }
    toast.success("Foto verwijderd");
  };

  const uploadingCat = Object.keys(bewaren)[0] ?? null;
  return { uploadingCat, bewaren, uploadProgress: {} as Record<string, number>, handleUpload, handleDelete, verstuur };
}
