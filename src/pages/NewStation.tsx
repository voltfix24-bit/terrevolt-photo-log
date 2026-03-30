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
    <div className="min-h-screen bg-app-background pb-28 md:pb-8">
      <main className="pt-6 pb-8 px-5 max-w-lg mx-auto animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-extrabold text-text-primary font-display tracking-tight">Nieuw station</h2>
          <button
            onClick={() => navigate("/")}
            className="w-10 h-10 rounded-full bg-surface-high flex items-center justify-center hover:bg-surface-highest transition-colors"
          >
            <span className="material-symbols-rounded text-text-secondary text-xl">close</span>
          </button>
        </div>

        <div className="space-y-6">
          {/* Naam MSR */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-accent-gold mb-2">Naam MSR</label>
            <input
              type="text"
              placeholder="bv. Sint Martinusstraat 49NB"
              value={form.naam_msr}
              onChange={(e) => setForm({ ...form, naam_msr: e.target.value })}
              className="w-full px-4 py-3.5 bg-primary-container/15 border-0 rounded-2xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          {/* Behuizingsnummer */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Behuizingsnummer</label>
            <input
              type="text"
              placeholder="MSR-9920-X"
              value={form.behuizingsnummer}
              onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })}
              className="w-full px-4 py-3.5 bg-primary-container/15 border-0 rounded-2xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          {/* Datum */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Datum</label>
            <input
              type="date"
              value={form.datum}
              onChange={(e) => setForm({ ...form, datum: e.target.value })}
              className="w-full px-4 py-3.5 bg-primary-container/15 border-0 rounded-2xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          {/* Ingevuld door */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Ingevuld door</label>
            <input
              type="text"
              placeholder="Naam monteur"
              value={form.ingevuld_door}
              onChange={(e) => setForm({ ...form, ingevuld_door: e.target.value })}
              className="w-full px-4 py-3.5 bg-primary-container/15 border-0 rounded-2xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          {/* Type ruimte */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Type ruimte</label>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, type_ruimte: "Compact Station" })}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all ${
                  form.type_ruimte === "Compact Station"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-primary-container/15 text-on-surface hover:bg-primary-container/25"
                }`}
              >
                <span className={`material-symbols-rounded text-2xl ${
                  form.type_ruimte === "Compact Station" ? "text-primary-foreground" : "text-primary"
                }`}>dashboard</span>
                <div>
                  <div className="font-bold text-sm">Compact Station</div>
                  <div className={`text-[11px] uppercase tracking-wider mt-0.5 ${
                    form.type_ruimte === "Compact Station" ? "text-primary-foreground/70" : "text-on-surface-variant"
                  }`}>Modulair & ruimte-efficiënt</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, type_ruimte: "Betreedbaar station" })}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all ${
                  form.type_ruimte === "Betreedbaar station"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-primary-container/15 text-on-surface hover:bg-primary-container/25"
                }`}
              >
                <span className={`material-symbols-rounded text-2xl ${
                  form.type_ruimte === "Betreedbaar station" ? "text-primary-foreground" : "text-primary"
                }`}>door_open</span>
                <div>
                  <div className="font-bold text-sm">Betreedbaar station</div>
                  <div className={`text-[11px] uppercase tracking-wider mt-0.5 ${
                    form.type_ruimte === "Betreedbaar station" ? "text-primary-foreground/70" : "text-on-surface-variant"
                  }`}>Volledig toegankelijk</div>
                </div>
              </button>
            </div>
          </div>

          {/* Extra opties */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Extra opties</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between px-5 py-4 bg-primary-container/15 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-rounded text-primary text-xl">bolt</span>
                  </div>
                  <span className="text-sm font-semibold text-on-surface">Vermogensveld aanwezig</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, vermogensveld: !form.vermogensveld })}
                  className={`w-[52px] h-[30px] rounded-full relative cursor-pointer transition-colors duration-300 ${
                    form.vermogensveld ? "bg-primary" : "bg-on-surface/20"
                  }`}
                >
                  <div
                    className={`w-[26px] h-[26px] rounded-full absolute top-[2px] shadow-md transition-all duration-300 ${
                      form.vermogensveld ? "left-[24px] bg-primary-foreground" : "left-[2px] bg-card"
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between px-5 py-4 bg-primary-container/15 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-rounded text-primary text-xl">electrical_services</span>
                  </div>
                  <span className="text-sm font-semibold text-on-surface">DA-kast aanwezig</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, da_kast: !form.da_kast })}
                  className={`w-[52px] h-[30px] rounded-full relative cursor-pointer transition-colors duration-300 ${
                    form.da_kast ? "bg-primary" : "bg-on-surface/20"
                  }`}
                >
                  <div
                    className={`w-[26px] h-[26px] rounded-full absolute top-[2px] shadow-md transition-all duration-300 ${
                      form.da_kast ? "left-[24px] bg-primary-foreground" : "left-[2px] bg-card"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.98] transition-all mt-2 disabled:opacity-50"
          >
            {loading ? "Opslaan..." : "Station opslaan"}
            <span className="material-symbols-rounded text-xl">save</span>
          </button>
        </div>
      </main>
    </div>
  );
}
