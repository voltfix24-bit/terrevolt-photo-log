import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/categories";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MAX_SIZE = 10 * 1024 * 1024;

interface VoorbeeldFoto {
  id: string;
  categorie: string;
  url: string;
  storage_path: string;
}

export function useVoorbeelden() {
  return useQuery({
    queryKey: ["categorie_voorbeelden"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorie_voorbeelden")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as VoorbeeldFoto[];
    },
  });
}

export function CategorieSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data: voorbeelden } = useVoorbeelden();
  const [uploading, setUploading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadCatRef = useRef<string>("");

  const voorbeeldenByCat = useCallback(
    (cat: string) => voorbeelden?.filter((v) => v.categorie === cat) ?? [],
    [voorbeelden]
  );

  const handleUpload = async (categorie: string, files: FileList) => {
    setUploading(categorie);
    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) { toast.error(`${file.name} is groter dan 10MB`); continue; }

      let compressed: File = file;
      if (file.type !== "image/heic") {
        try {
          compressed = await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.85 });
        } catch { /* use original */ }
      }

      const path = `voorbeelden/${categorie.replace(/[^a-z0-9]/gi, "_")}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("to-fotos").upload(path, compressed);
      if (error) { toast.error(`Upload mislukt: ${error.message}`); continue; }

      const { data: urlData } = supabase.storage.from("to-fotos").getPublicUrl(path);
      await supabase.from("categorie_voorbeelden").insert({
        categorie,
        url: urlData.publicUrl,
        storage_path: path,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["categorie_voorbeelden"] });
    setUploading(null);
    toast.success("Voorbeeld foto geüpload ✓");
  };

  const handleDelete = async (v: VoorbeeldFoto) => {
    await supabase.storage.from("to-fotos").remove([v.storage_path]);
    await supabase.from("categorie_voorbeelden").delete().eq("id", v.id);
    queryClient.invalidateQueries({ queryKey: ["categorie_voorbeelden"] });
    toast.success("Voorbeeld verwijderd");
  };

  const filtered = CATEGORIES.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || String(c.id).includes(search)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-outline-variant/20">
          <DialogTitle className="text-lg font-black text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">settings</span>
            Categorieën beheren
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">Voeg voorbeeld foto's toe per categorie zodat monteurs weten wat ze moeten fotograferen.</p>
          <div className="relative mt-3">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek categorie..."
              className="w-full bg-surface-container border border-outline-variant/20 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>
        </DialogHeader>

        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => {
            if (e.target.files && uploadCatRef.current) handleUpload(uploadCatRef.current, e.target.files);
            e.target.value = "";
          }}
        />

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.map((cat) => {
            const examples = voorbeeldenByCat(cat.name);
            const isUploading = uploading === cat.name;

            return (
              <div key={cat.id} className="bg-surface-low rounded-2xl p-3 border border-outline-variant/10">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-muted-foreground">{String(cat.id).padStart(2, "0")}</span>
                      <h4 className="text-sm font-bold text-on-surface truncate">{cat.name}</h4>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{cat.instruction}</p>
                  </div>
                  <button
                    onClick={() => { uploadCatRef.current = cat.name; fileRef.current?.click(); }}
                    disabled={isUploading}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-primary bg-primary-container/30 px-3 py-1.5 rounded-xl hover:bg-primary-container/50 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">add_photo_alternate</span>
                    {isUploading ? "Uploaden..." : "Voorbeeld"}
                  </button>
                </div>

                {examples.length > 0 && (
                  <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                    {examples.map((v) => (
                      <div key={v.id} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-surface-container border border-outline-variant/20">
                        <img src={v.url} alt="" className="w-full h-full object-cover" />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500/90 rounded-full text-white text-[9px] flex items-center justify-center border border-white active:scale-90">×</button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Voorbeeld verwijderen?</AlertDialogTitle><AlertDialogDescription>Dit voorbeeld wordt permanent verwijderd.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(v)}>Verwijderen</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
