import { BEHEER_NODIG, fotowerkVoorActie } from "@/lib/require-pin";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { queuePhoto } from "@/lib/offline-queue";
import { nieuwPad, uploadEnRegistreer, verwijderFoto } from "@/lib/fotos-service";
import { fotoFout } from "@/lib/foto-validatie";
import type { FotoRow } from "@/components/station/types";

const compressImage = async (file: File): Promise<File> => {
  if (file.type === "image/heic") return file;
  try {
    return await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.85 });
  } catch { return file; }
};

/** Foto-upload voor een station: offline in de wachtrij, online via fotos-service; één upload per categorie tegelijk. */
export function useStationUpload(id: string | undefined, opts: {
  beschermd?: boolean;
  fotosByCategorie: (cat: string) => FotoRow[];
  isSkipped: (cat: string) => boolean;
  removeSkip: (cat: string) => void;
}) {
  const queryClient = useQueryClient();
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const uploadBezig = useRef<Set<string>>(new Set());

  // Geeft de bestandsnamen terug die NIET zijn opgeslagen, zodat de wizard die previews kan verwijderen.
  const handleUpload = async (categorie: string, files: FileList): Promise<string[]> => {
    const mislukt: string[] = [];
    if (!id) return Array.from(files).map(f => f.name);
    if (!navigator.onLine && opts.beschermd) { toast.error("Internet en de toegangscode zijn nodig voor dit opgeleverde dossier."); return Array.from(files).map(f => f.name); }
    if (navigator.onLine && !await fotowerkVoorActie(id)) { toast.error(BEHEER_NODIG); return Array.from(files).map(f => f.name); }
    if (!navigator.onLine) {
      let queued = 0;
      for (const file of Array.from(files)) {
        const fout = fotoFout(file);
        if (fout) { toast.error(fout); mislukt.push(file.name); continue; }
        try { await queuePhoto(id, categorie, file); queued++; }
        catch { toast.error(`${file.name} niet lokaal bewaard — mogelijk is de opslag vol. Bewaar de originele foto en probeer opnieuw.`); mislukt.push(file.name); }
      }
      if (queued > 0) {
        toast.success(`${queued} foto${queued > 1 ? "'s" : ""} opgeslagen — wordt geüpload zodra je online bent`, { duration: 4000 });
      }
      return mislukt;
    }

    if (uploadBezig.current.has(categorie)) { toast.info("Upload loopt al voor deze categorie"); return Array.from(files).map((f) => f.name); }
    uploadBezig.current.add(categorie);
    setUploadingCat(categorie);
    const total = files.length;
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        const fout = fotoFout(file);
        if (fout) { toast.error(fout); mislukt.push(file.name); continue; }
        try {
          const compressed = await compressImage(file);
          const r = await uploadEnRegistreer(nieuwPad(id, categorie, file.name), compressed, { stationId: id, categorie, volgorde: opts.fotosByCategorie(categorie).length + done });
          if ("stap" in r) {
            toast.error(/row.level|permission|beheer|42501/i.test(r.fout) ? BEHEER_NODIG : `${file.name} niet opgeslagen — probeer opnieuw`);
            mislukt.push(file.name); continue;
          }
          done++;
          setUploadProgress((p) => ({ ...p, [categorie]: Math.round((done / total) * 100) }));
        } catch (e) {
          console.error("upload mislukt", e);
          toast.error(`Upload mislukt: ${file.name}`); mislukt.push(file.name);
        }
      }
    } finally {
      uploadBezig.current.delete(categorie);
      queryClient.invalidateQueries({ queryKey: ["fotos", id] });
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      setUploadingCat(null);
      setUploadProgress((p) => { const next = { ...p }; delete next[categorie]; return next; });
    }
    if (done > 0) toast.success(done === total ? "Foto's geüpload ✓" : `${done} van ${total} foto's geüpload`);
    if (done > 0 && opts.isSkipped(categorie)) { opts.removeSkip(categorie); toast.info("N.v.t. opgeheven: er is toch een foto"); }
    return mislukt;
  };

  const handleDelete = async (fotoId: string, storagePath: string) => {
    const r = await verwijderFoto(fotoId, storagePath);
    queryClient.invalidateQueries({ queryKey: ["fotos", id] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    if (!r.ok) { toast.error("Foto verwijderen mislukt — probeer opnieuw"); return; }
    toast.success("Foto verwijderd");
  };

  return { uploadingCat, uploadProgress, handleUpload, handleDelete };
}
