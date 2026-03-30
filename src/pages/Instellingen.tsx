import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CategorieSettingsDialog } from "@/components/CategorieSettings";

export default function Instellingen() {
  const navigate = useNavigate();
  const [catOpen, setCatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <CategorieSettingsDialog open={catOpen} onOpenChange={setCatOpen} />

      <main className="pt-24 pb-8 px-6 max-w-2xl mx-auto animate-fade-up">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors font-semibold mb-6">
          <span className="material-symbols-outlined text-lg">arrow_back_ios</span> Terug
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground text-xl font-black shadow-lg shadow-primary/30">
            TV
          </div>
          <div>
            <h1 className="text-2xl font-black text-on-surface">Instellingen</h1>
            <p className="text-sm text-muted-foreground">Terrevolt B.V.</p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setCatOpen(true)}
            className="w-full bg-card rounded-2xl p-4 border border-outline-variant/10 shadow-sm flex items-center justify-between hover:shadow-md transition-all active:scale-[0.98] text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary-container/30 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">photo_library</span>
              </div>
              <div>
                <div className="font-bold text-sm text-on-surface">Categorieën beheren</div>
                <div className="text-xs text-muted-foreground">Voorbeeld foto's toevoegen per categorie</div>
              </div>
            </div>
            <span className="material-symbols-outlined text-muted-foreground">chevron_right</span>
          </button>
        </div>
      </main>
    </div>
  );
}
