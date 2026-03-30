import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function NewStation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    naam_msr: "",
    behuizingsnummer: "",
    type_ruimte: "",
    ingevuld_door: "",
    datum: new Date().toISOString().split("T")[0],
    vermogensveld: false,
    da_kast: false,
  });

  const handleSubmit = async () => {
    if (!form.naam_msr || !form.type_ruimte) {
      toast.error("Vul minimaal de naam MSR en type ruimte in");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("stations")
      .insert({
        naam_msr: form.naam_msr,
        behuizingsnummer: form.behuizingsnummer || null,
        type_ruimte: form.type_ruimte,
        ingevuld_door: form.ingevuld_door || null,
        datum: form.datum || null,
        vermogensveld: form.vermogensveld,
        da_kast: form.da_kast,
      })
      .select()
      .single();

    setLoading(false);
    if (error) {
      toast.error("Fout bij opslaan: " + error.message);
    } else {
      toast.success("Station opgeslagen!");
      navigate(`/stations/${data.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <main className="pt-24 pb-8 px-6 max-w-2xl mx-auto animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back_ios</span> Annuleren
          </button>
          <h2 className="text-lg font-black text-on-surface">Nieuw station</h2>
          <div className="w-20" />
        </div>

        <div className="bg-card rounded-3xl p-6 shadow-sm border border-outline-variant/10 space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Naam MSR *</label>
            <input
              type="text"
              placeholder="Bijv. Sint martinusstraat 49NB"
              value={form.naam_msr}
              onChange={(e) => setForm({ ...form, naam_msr: e.target.value })}
              className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition text-on-surface"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Behuizingsnummer</label>
              <input
                type="text"
                placeholder="0 200 550"
                value={form.behuizingsnummer}
                onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })}
                className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition text-on-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Datum</label>
              <input
                type="date"
                value={form.datum}
                onChange={(e) => setForm({ ...form, datum: e.target.value })}
                className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition text-on-surface"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Type ruimte *</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, type_ruimte: "Compact Station" })}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                  form.type_ruimte === "Compact Station"
                    ? "border-orange/40 bg-orange/5 text-orange"
                    : "border-outline-variant/30 text-on-surface-variant"
                }`}
              >
                Compact Station
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, type_ruimte: "Betreedbaar station" })}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                  form.type_ruimte === "Betreedbaar station"
                    ? "border-purple/40 bg-purple/5 text-purple"
                    : "border-outline-variant/30 text-on-surface-variant"
                }`}
              >
                Betreedbaar station
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Ingevuld door</label>
            <input
              type="text"
              placeholder="Naam monteur"
              value={form.ingevuld_door}
              onChange={(e) => setForm({ ...form, ingevuld_door: e.target.value })}
              className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition text-on-surface"
            />
          </div>

          <div className="pt-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">Extra opties</label>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-4 py-3.5 bg-surface-low rounded-xl border border-outline-variant/20">
                <div>
                  <div className="text-sm font-semibold text-on-surface">Vermogensveld aanwezig</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">Categorie 14 is van toepassing</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, vermogensveld: !form.vermogensveld })}
                  className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-200 ${
                    form.vermogensveld ? "bg-primary-light" : "bg-outline-variant/40"
                  }`}
                >
                  <div
                    className="w-5 h-5 bg-card rounded-full absolute top-0.5 left-0.5 shadow-sm transition-transform duration-200"
                    style={{ transform: form.vermogensveld ? "translateX(24px)" : "translateX(0)" }}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between px-4 py-3.5 bg-surface-low rounded-xl border border-outline-variant/20">
                <div>
                  <div className="text-sm font-semibold text-on-surface">DA-kast aanwezig</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">Categorie 15 is van toepassing</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, da_kast: !form.da_kast })}
                  className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-200 ${
                    form.da_kast ? "bg-primary-light" : "bg-outline-variant/40"
                  }`}
                >
                  <div
                    className="w-5 h-5 bg-card rounded-full absolute top-0.5 left-0.5 shadow-sm transition-transform duration-200"
                    style={{ transform: form.da_kast ? "translateX(24px)" : "translateX(0)" }}
                  />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary to-primary-light text-primary-foreground font-bold py-4 rounded-xl shadow-xl shadow-primary/25 hover:scale-[1.01] active:scale-[0.98] transition-transform mt-2 disabled:opacity-50"
          >
            {loading ? "Opslaan..." : "Station opslaan"}
          </button>
        </div>
      </main>
    </div>
  );
}
