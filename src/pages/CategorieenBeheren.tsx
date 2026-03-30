import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/categories";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { useVoorbeelden } from "@/components/CategorieSettings";
import { useMergedCategories, useSaveCategoryOverride, useBulkUpdateOrder, MergedCategory } from "@/hooks/use-categories";
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

/* ── Inline edit form for a single category ── */
function CategoryEditForm({
  cat,
  onClose,
}: {
  cat: MergedCategory;
  onClose: () => void;
}) {
  const [naam, setNaam] = useState(cat.effectiveName);
  const [instructie, setInstructie] = useState(cat.effectiveInstruction);
  const [tip, setTip] = useState(cat.effectiveTip);
  const save = useSaveCategoryOverride();

  const handleSave = () => {
    save.mutate(
      {
        categorie_id: cat.id,
        naam: naam !== cat.name ? naam : undefined,
        instructie: instructie !== cat.instruction ? instructie : undefined,
        tip: tip !== (cat.tip || "") ? tip : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Categorie bijgewerkt ✓");
          onClose();
        },
      }
    );
  };

  return (
    <div className="mt-3 space-y-3 border-t border-outline-variant/10 pt-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-accent-gold mb-1 block">
          Naam
        </label>
        <input
          value={naam}
          onChange={(e) => setNaam(e.target.value)}
          className="w-full bg-surface-high border border-outline-variant/20 rounded-xl py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-accent-gold mb-1 block">
          Instructietekst
        </label>
        <textarea
          value={instructie}
          onChange={(e) => setInstructie(e.target.value)}
          rows={3}
          className="w-full bg-surface-high border border-outline-variant/20 rounded-xl py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-accent-gold mb-1 block">
          Tip / Extra uitleg
        </label>
        <textarea
          value={tip}
          onChange={(e) => setTip(e.target.value)}
          rows={2}
          className="w-full bg-surface-high border border-outline-variant/20 rounded-xl py-2 px-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary bg-surface-high hover:bg-surface-default transition-colors"
        >
          Annuleren
        </button>
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="px-4 py-2 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {save.isPending ? "Opslaan..." : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

export default function CategorieenBeheren() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: voorbeelden } = useVoorbeelden();
  const { categories: mergedCats, isLoading: catsLoading } = useMergedCategories();
  const bulkOrder = useBulkUpdateOrder();

  const [uploading, setUploading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "filled" | "empty">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [orderedCats, setOrderedCats] = useState<MergedCategory[] | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadCatRef = useRef<string>("");

  const voorbeeldenByCat = useCallback(
    (cat: string) => voorbeelden?.filter((v) => v.categorie === cat) ?? [],
    [voorbeelden]
  );

  const filledCount = mergedCats.filter((c) => voorbeeldenByCat(c.name).length > 0).length;
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
      await supabase.from("categorie_voorbeelden").insert({ categorie, url: urlData.publicUrl, storage_path: path });
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

  /* ── Reorder helpers ── */
  const startReorder = () => {
    setReordering(true);
    setOrderedCats([...mergedCats]);
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (!orderedCats) return;
    const newArr = [...orderedCats];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newArr.length) return;
    [newArr[index], newArr[swapIdx]] = [newArr[swapIdx], newArr[index]];
    setOrderedCats(newArr);
  };

  const saveOrder = () => {
    if (!orderedCats) return;
    const updates = orderedCats.map((c, i) => ({
      categorie_id: c.id,
      volgorde: i + 1,
    }));
    bulkOrder.mutate(updates, {
      onSuccess: () => setReordering(false),
    });
  };

  const cancelReorder = () => {
    setReordering(false);
    setOrderedCats(null);
  };

  /* ── Filtering ── */
  const displayCats = reordering ? (orderedCats ?? mergedCats) : mergedCats;
  const filtered = displayCats.filter((c) => {
    if (reordering) return true; // show all when reordering
    const matchesSearch = !search || c.effectiveName.toLowerCase().includes(search.toLowerCase()) || String(c.id).includes(search);
    const hasVoorbeelden = voorbeeldenByCat(c.name).length > 0;
    const matchesFilter = filter === "all" || (filter === "filled" && hasVoorbeelden) || (filter === "empty" && !hasVoorbeelden);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <main className="pt-24 pb-8 px-4 max-w-2xl mx-auto animate-fade-up">
        {/* Header */}
        <button onClick={() => navigate("/instellingen")} className="flex items-center gap-1 text-sm text-text-secondary hover:text-primary-hover transition-colors font-semibold mb-4">
          <span className="material-symbols-rounded text-lg">arrow_back_ios</span> Instellingen
        </button>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-on-surface">Categorieën beheren</h1>
          {!reordering ? (
            <button
              onClick={startReorder}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-surface-high text-text-secondary hover:text-primary-hover hover:bg-surface-default transition-all"
            >
              <span className="material-symbols-rounded text-sm">swap_vert</span>
              Volgorde
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={cancelReorder} className="text-xs font-bold px-3 py-2 rounded-xl bg-surface-high text-text-secondary hover:bg-surface-default transition-all">
                Annuleren
              </button>
              <button
                onClick={saveOrder}
                disabled={bulkOrder.isPending}
                className="text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary-hover transition-all disabled:opacity-50"
              >
                {bulkOrder.isPending ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          )}
        </div>

        {/* Search — hidden when reordering */}
        {!reordering && (
          <div className="relative mb-3">
            <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek categorie..."
              className="w-full bg-surface-white border border-outline-variant/20 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </div>
        )}

        {/* Stats banner */}
        {!reordering && (
          <div className="bg-card rounded-2xl p-4 border border-outline-variant/10 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-on-surface">Voorbeeld foto's</span>
              <span className="text-sm font-black text-primary">{filledCount} / {CATEGORIES.length}</span>
            </div>
            <div className="h-2 bg-surface-high rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-soft transition-all duration-500" style={{ width: `${fillPct}%` }} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">
              {filledCount === CATEGORIES.length
                ? "✓ Alle categorieën hebben een voorbeeld foto"
                : `${CATEGORIES.length - filledCount} categorieën hebben nog geen voorbeeld foto`}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {!reordering && (
          <div className="flex gap-1 bg-surface-high rounded-xl p-1 mb-3">
            <button onClick={() => setFilter("all")} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filter === "all" ? "bg-card shadow-sm text-on-surface" : "text-muted-foreground"}`}>
              Alle ({CATEGORIES.length})
            </button>
            <button onClick={() => setFilter("filled")} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filter === "filled" ? "bg-card shadow-sm text-primary" : "text-muted-foreground"}`}>
              ✓ Met foto ({filledCount})
            </button>
            <button onClick={() => setFilter("empty")} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filter === "empty" ? "bg-card shadow-sm text-orange-500" : "text-muted-foreground"}`}>
              Leeg ({CATEGORIES.length - filledCount})
            </button>
          </div>
        )}

        {/* Reorder hint */}
        {reordering && (
          <div className="bg-accent-gold/10 text-accent-gold rounded-xl px-4 py-3 text-xs font-semibold mb-3 flex items-center gap-2">
            <span className="material-symbols-rounded text-sm">info</span>
            Gebruik de pijltjes om categorieën te verplaatsen. Klik &quot;Opslaan&quot; als je klaar bent.
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => {
            if (e.target.files && uploadCatRef.current) handleUpload(uploadCatRef.current, e.target.files);
            e.target.value = "";
          }}
        />

        {/* Category list */}
        <div className="space-y-3">
          {filtered.map((cat, index) => {
            const examples = voorbeeldenByCat(cat.name);
            const isUploading = uploading === cat.name;
            const isEditing = editingId === cat.id;
            const isCustomized = !!cat.override;

            return (
              <div key={cat.id} className={`bg-card rounded-2xl p-4 border transition-all ${isEditing ? "border-primary/30 shadow-md" : "border-outline-variant/10 shadow-sm"}`}>
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Reorder controls */}
                    {reordering && (
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => moveItem(index, "up")}
                          disabled={index === 0}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-high text-text-secondary hover:text-primary-hover hover:bg-surface-default disabled:opacity-30 transition-all"
                        >
                          <span className="material-symbols-rounded text-sm">keyboard_arrow_up</span>
                        </button>
                        <button
                          onClick={() => moveItem(index, "down")}
                          disabled={index === filtered.length - 1}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-high text-text-secondary hover:text-primary-hover hover:bg-surface-default disabled:opacity-30 transition-all"
                        >
                          <span className="material-symbols-rounded text-sm">keyboard_arrow_down</span>
                        </button>
                      </div>
                    )}

                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${examples.length > 0 ? "bg-primary-soft" : "bg-outline-variant"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-muted-foreground font-mono">
                          {String(reordering ? index + 1 : cat.effectiveOrder).padStart(2, "0")}
                        </span>
                        <h4 className="text-sm font-bold text-on-surface truncate">{cat.effectiveName}</h4>
                        {isCustomized && !reordering && (
                          <span className="text-[9px] font-bold text-accent-gold bg-accent-gold/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
                            Aangepast
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{cat.effectiveInstruction}</p>
                      {cat.effectiveTip && !isEditing && (
                        <p className="text-[10px] text-accent-gold/80 mt-0.5 line-clamp-1 italic">💡 {cat.effectiveTip}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {!reordering && (
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      {/* Edit button */}
                      <button
                        onClick={() => setEditingId(isEditing ? null : cat.id)}
                        className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all active:scale-95 ${
                          isEditing
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-high text-text-secondary hover:text-primary-hover hover:bg-surface-default"
                        }`}
                      >
                        <span className="material-symbols-rounded text-sm">{isEditing ? "close" : "edit"}</span>
                      </button>
                      {/* Upload button */}
                      <button
                        onClick={() => { uploadCatRef.current = cat.name; fileRef.current?.click(); }}
                        disabled={isUploading}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50 ${
                          examples.length > 0
                            ? "bg-surface-high text-text-secondary hover:bg-surface-default hover:text-primary-hover"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        <span className="material-symbols-rounded text-sm">
                          {isUploading ? "hourglass_empty" : "add_photo_alternate"}
                        </span>
                        {isUploading ? "..." : examples.length > 0 ? "Meer" : "Foto"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline edit form */}
                {isEditing && !reordering && (
                  <CategoryEditForm cat={cat} onClose={() => setEditingId(null)} />
                )}

                {/* Photo strip */}
                {examples.length > 0 && !reordering && (
                  <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory mt-3">
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
                {examples.length === 0 && !reordering && !isEditing && (
                  <div className="text-[11px] text-muted-foreground/60 italic mt-2">
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
