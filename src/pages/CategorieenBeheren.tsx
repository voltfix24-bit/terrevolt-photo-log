import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, SECTIONS } from "@/lib/categories";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { useVoorbeelden } from "@/components/CategorieSettings";
import { useMergedCategories, useSaveCategoryOverride, MergedCategory } from "@/hooks/use-categories";
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
  const { categories: mergedCats } = useMergedCategories();

  const [uploading, setUploading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "filled" | "empty">("all");
  const [editingId, setEditingId] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadCatRef = useRef<string>("");

  const voorbeeldenByCat = useCallback(
    (cat: string) => voorbeelden?.filter((v) => v.categorie === cat) ?? [],
    [voorbeelden]
  );

  const filledCount = mergedCats.filter((c) => voorbeeldenByCat(c.name).length > 0).length;
  const fillPct = Math.round((filledCount / CATEGORIES.length) * 100);

  /* ── Section accordion state ── */
  const [openSections, setOpenSections] = useState<string[]>(() => {
    const firstIncomplete = SECTIONS.find(s => {
      const cats = CATEGORIES.filter(c => c.section === s.id);
      return cats.some(c => {
        // We can't call voorbeeldenByCat here yet, so just open first section
        return true;
      });
    });
    return firstIncomplete ? [firstIncomplete.id] : [];
  });

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

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

  /* ── Filtering per section ── */
  const getSectionFilteredCats = (sectionId: string) => {
    return mergedCats
      .filter(c => c.section === sectionId)
      .filter(c => {
        const matchSearch = !search ||
          c.effectiveName.toLowerCase().includes(search.toLowerCase()) ||
          String(c.id).includes(search);
        const hasVoorb = voorbeeldenByCat(c.name).length > 0;
        const matchFilter =
          filter === "all" ||
          (filter === "filled" && hasVoorb) ||
          (filter === "empty" && !hasVoorb);
        return matchSearch && matchFilter;
      });
  };

  const visibleSections = SECTIONS.filter(s =>
    getSectionFilteredCats(s.id).length > 0
  );

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <main className="pt-24 pb-8 px-4 max-w-2xl mx-auto animate-fade-up">
        {/* Header */}
        <button onClick={() => navigate("/instellingen")} className="flex items-center gap-1 text-sm text-text-secondary hover:text-primary-hover transition-colors font-semibold mb-4">
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
            className="w-full bg-surface-white border border-outline-variant/20 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
        </div>

        {/* Stats banner */}
        <div className="bg-card rounded-2xl p-4 border border-outline-variant/10 shadow-sm mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold text-on-surface">Voorbeeld foto's compleet</span>
            <span className="text-sm font-extrabold text-primary">{filledCount} / {CATEGORIES.length}</span>
          </div>
          <div className="h-2 bg-surface-container rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-500"
              style={{ width: `${fillPct}%` }}
            />
          </div>
          {/* Section completion chips */}
          <div className="flex gap-1.5 flex-wrap mt-2">
            {SECTIONS.map(s => {
              const cats = CATEGORIES.filter(c => c.section === s.id);
              const filled = cats.filter(c => voorbeeldenByCat(c.name).length > 0).length;
              const complete = filled === cats.length;
              return (
                <div key={s.id} className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                  complete
                    ? 'bg-primary/10 text-primary'
                    : 'bg-surface-container text-muted-foreground'
                }`}>
                  {complete && <span className="material-symbols-rounded text-xs fill">check</span>}
                  {s.label.split(' ')[0]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-surface-high rounded-xl p-1 mb-4">
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

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => {
            if (e.target.files && uploadCatRef.current) handleUpload(uploadCatRef.current, e.target.files);
            e.target.value = "";
          }}
        />

        {/* Section accordions */}
        <div className="space-y-3">
          {visibleSections.map(section => {
            const allCatsInSection = CATEGORIES.filter(c => c.section === section.id);
            const filteredCats = getSectionFilteredCats(section.id);
            const withVoorbeeldInSection = allCatsInSection.filter(c => voorbeeldenByCat(c.name).length > 0).length;
            const sectionComplete = withVoorbeeldInSection === allCatsInSection.length;
            const isOpen = openSections.includes(section.id);

            return (
              <div key={section.id} className={`rounded-2xl overflow-hidden border shadow-sm ${
                sectionComplete
                  ? 'bg-primary/8 border-primary/25'
                  : 'bg-card border-outline-variant/15'
              }`}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 relative ${
                    sectionComplete ? 'bg-primary' : 'bg-surface-container'
                  }`}>
                    <span className={`material-symbols-rounded fill text-lg ${
                      sectionComplete ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}>
                      {sectionComplete ? 'check' : 'photo_library'}
                    </span>
                    {!sectionComplete && withVoorbeeldInSection < allCatsInSection.length && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange rounded-full flex items-center justify-center">
                        <span className="text-[8px] font-black text-white">
                          {allCatsInSection.length - withVoorbeeldInSection}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-display font-extrabold text-[15px] ${
                      sectionComplete ? 'text-primary' : 'text-on-surface'
                    }`}>
                      {section.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {withVoorbeeldInSection} / {allCatsInSection.length} hebben voorbeeld foto
                    </div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="w-16">
                    <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                        style={{ width: `${(withVoorbeeldInSection / allCatsInSection.length) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="material-symbols-rounded text-muted-foreground/40 text-xl">
                    {isOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {/* Expanded category list */}
                {isOpen && (
                  <div className="border-t border-outline-variant/10">
                    {filteredCats.map((cat, idx) => {
                      const examples = voorbeeldenByCat(cat.name);
                      const hasVoorbeeld = examples.length > 0;
                      const isUploading = uploading === cat.name;
                      const isEditing = editingId === cat.id;

                      return (
                        <div key={cat.id} className={idx < filteredCats.length - 1 ? 'border-b border-outline-variant/8' : ''}>
                          <div className="px-4 py-3.5 flex items-start gap-3">
                            {/* Status dot */}
                            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                              hasVoorbeeld ? 'bg-primary' : 'bg-outline-variant'
                            }`} />

                            {/* Category info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-black text-muted-foreground font-mono">
                                  {String(cat.id).padStart(2, '0')}
                                </span>
                                <span className="text-sm font-bold text-on-surface">
                                  {cat.effectiveName}
                                </span>
                                {cat.override && (
                                  <span className="text-[9px] font-bold text-accent-gold bg-accent-gold/10 px-1.5 py-0.5 rounded-md flex-shrink-0">
                                    Aangepast
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug mb-1.5">
                                {cat.effectiveInstruction}
                              </p>
                              {cat.effectiveTip && !isEditing && (
                                <p className="text-[10px] text-amber-600/80 italic leading-snug mb-1.5">
                                  💡 {cat.effectiveTip}
                                </p>
                              )}

                              {/* Voorbeeld thumbnails */}
                              {hasVoorbeeld && (
                                <div className="flex gap-1.5 mt-1">
                                  {examples.map(v => (
                                    <div key={v.id} className="relative w-14 h-14 rounded-xl overflow-hidden border border-outline-variant/20">
                                      <img src={v.url} alt="" className="w-full h-full object-cover" />
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <button className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500/90 rounded-full text-white text-[9px] flex items-center justify-center border border-white">×</button>
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
                              {!hasVoorbeeld && (
                                <p className="text-[11px] text-muted-foreground/50 italic">
                                  Nog geen voorbeeld foto
                                </p>
                              )}

                              {/* Inline edit form */}
                              {isEditing && (
                                <CategoryEditForm cat={cat} onClose={() => setEditingId(null)} />
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => setEditingId(isEditing ? null : cat.id)}
                                className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all active:scale-95 ${
                                  isEditing
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-surface-high text-text-secondary hover:text-primary-hover hover:bg-surface-default"
                                }`}
                              >
                                <span className="material-symbols-rounded text-sm">{isEditing ? "close" : "edit"}</span>
                              </button>
                              <button
                                onClick={() => { uploadCatRef.current = cat.name; fileRef.current?.click(); }}
                                disabled={isUploading}
                                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50 ${
                                  hasVoorbeeld
                                    ? 'bg-surface-container text-muted-foreground'
                                    : 'bg-primary/10 text-primary'
                                }`}
                              >
                                <span className="material-symbols-rounded text-sm">
                                  {isUploading ? 'hourglass_empty' : 'add_photo_alternate'}
                                </span>
                                {isUploading ? '...' : hasVoorbeeld ? 'Meer' : 'Foto'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
