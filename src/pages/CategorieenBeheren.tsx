import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/categories";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { useVoorbeelden } from "@/components/CategorieSettings";
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

export default function CategorieenBeheren() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: voorbeelden } = useVoorbeelden();
  const [uploading, setUploading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<'all' | 'filled' | 'empty'>('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadCatRef = useRef<string>("");

  const voorbeeldenByCat = useCallback(
    (cat: string) => voorbeelden?.filter((v) => v.categorie === cat) ?? [],
    [voorbeelden]
  );

  const filledCount = CATEGORIES.filter(c => voorbeeldenByCat(c.name).length > 0).length;
  const fillPct = Math.round((filledCount / CATEGORIES.length) * 100);

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

  const filtered = CATEGORIES.filter(c => {
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || String(c.id).includes(search);
    const hasVoorbeelden = voorbeeldenByCat(c.name).length > 0;
    const matchesFilter = filter === 'all' || (filter === 'filled' && hasVoorbeelden) || (filter === 'empty' && !hasVoorbeelden);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <main className="pt-24 pb-8 px-4 max-w-2xl mx-auto animate-fade-up">
        {/* Header */}
        <button onClick={() => navigate("/instellingen")} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors font-semibold mb-4">
          <span className="material-symbols-rounded text-lg">arrow_back_ios</span> Instellingen
        </button>

        <h1 className="text-2xl font-black text-on-surface mb-4">Categorieën beheren</h1>

        {/* Search */}
        <div className="relative mb-3">
          <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek categorie..."
            className="w-full bg-surface-container border border-outline-variant/20 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
        </div>

        {/* Stats banner */}
        <div className="bg-card rounded-2xl p-4 border border-outline-variant/10 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-on-surface">Voorbeeld foto's</span>
            <span className="text-sm font-black text-primary">{filledCount} / {CATEGORIES.length}</span>
          </div>
          <div className="h-2 bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-500"
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1.5">
            {filledCount === CATEGORIES.length
              ? '✓ Alle categorieën hebben een voorbeeld foto'
              : `${CATEGORIES.length - filledCount} categorieën hebben nog geen voorbeeld foto`
            }
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-surface-container rounded-xl p-1 mb-3">
          <button onClick={() => setFilter('all')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'all' ? 'bg-card shadow-sm text-on-surface' : 'text-muted-foreground'}`}>
            Alle ({CATEGORIES.length})
          </button>
          <button onClick={() => setFilter('filled')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'filled' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}>
            ✓ Met foto ({filledCount})
          </button>
          <button onClick={() => setFilter('empty')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'empty' ? 'bg-card shadow-sm text-orange-500' : 'text-muted-foreground'}`}>
            Leeg ({CATEGORIES.length - filledCount})
          </button>
        </div>

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => {
            if (e.target.files && uploadCatRef.current) handleUpload(uploadCatRef.current, e.target.files);
            e.target.value = "";
          }}
        />

        {/* Category list */}
        <div className="space-y-3">
          {filtered.map((cat) => {
            const examples = voorbeeldenByCat(cat.name);
            const isUploading = uploading === cat.name;

            return (
              <div key={cat.id} className="bg-card rounded-2xl p-4 border border-outline-variant/10 shadow-sm">
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      examples.length > 0 ? 'bg-primary-light' : 'bg-outline-variant'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-muted-foreground font-mono">
                          {String(cat.id).padStart(2, "0")}
                        </span>
                        <h4 className="text-sm font-bold text-on-surface truncate">{cat.name}</h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{cat.instruction}</p>
                    </div>
                  </div>

                  {/* Upload button */}
                  <button
                    onClick={() => { uploadCatRef.current = cat.name; fileRef.current?.click(); }}
                    disabled={isUploading}
                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50 ml-2 ${
                      examples.length > 0
                        ? 'bg-surface-container text-muted-foreground hover:bg-surface-high'
                        : 'bg-primary-container/40 text-primary hover:bg-primary-container/60'
                    }`}
                  >
                    <span className="material-symbols-rounded text-sm">
                      {isUploading ? 'hourglass_empty' : 'add_photo_alternate'}
                    </span>
                    {isUploading ? 'Uploaden...' : examples.length > 0 ? 'Meer' : 'Toevoegen'}
                  </button>
                </div>

                {/* Photo strip */}
                {examples.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
                    {examples.map((v) => (
                      <div key={v.id} className="relative flex-shrink-0 snap-start w-20 h-20 rounded-xl overflow-hidden border border-outline-variant/20">
                        <img src={v.url} alt="" className="w-full h-full object-cover" />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="absolute top-1 right-1 w-5 h-5 bg-red-500/90 rounded-full text-white text-[10px] flex items-center justify-center border-[1.5px] border-white active:scale-90">×</button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Voorbeeld verwijderen?</AlertDialogTitle>
                              <AlertDialogDescription>Dit voorbeeld wordt permanent verwijderd.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuleren</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(v)}>Verwijderen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {examples.length === 0 && (
                  <div className="text-[11px] text-muted-foreground/60 italic">
                    Nog geen voorbeeld foto — monteurs zien alleen de instructietekst.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
