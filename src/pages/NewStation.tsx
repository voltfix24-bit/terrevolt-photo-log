import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function NewStation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    naam_msr: "",
    behuizingsnummer: "",
    type_ruimte: "",
    datum: new Date().toISOString().split("T")[0],
    vermogensveld: false,
    da_kast: false,
  });

  const [selectedMonteur, setSelectedMonteur] = useState('');
  const [monteurInput, setMonteurInput] = useState('');
  const [monteurFocused, setMonteurFocused] = useState(false);

  const { data: monteurs } = useQuery({
    queryKey: ['monteurs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monteurs' as any)
        .select('*')
        .order('naam', { ascending: true });
      if (error) throw error;
      return (data as any) as { id: string; naam: string; created_at: string }[];
    }
  });

  const handleSubmit = async () => {
    if (!form.naam_msr || !form.type_ruimte) {
      toast.error("Vul minimaal de naam MSR en type ruimte in");
      return;
    }
    if (!selectedMonteur) {
      toast.error("Selecteer of voeg een monteur toe");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("stations")
      .insert({
        naam_msr: form.naam_msr,
        behuizingsnummer: form.behuizingsnummer || null,
        type_ruimte: form.type_ruimte,
        ingevuld_door: selectedMonteur || null,
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
              className="w-full px-4 py-3.5 bg-surface-low border-0 rounded-2xl text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          {/* Behuizingsnummer */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-accent-gold mb-2">Behuizingsnummer</label>
            <input
              type="text"
              placeholder="MSR-9920-X"
              value={form.behuizingsnummer}
              onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })}
              className="w-full px-4 py-3.5 bg-surface-low border-0 rounded-2xl text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          {/* Datum */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-accent-gold mb-2">Datum</label>
            <input
              type="date"
              value={form.datum}
              onChange={(e) => setForm({ ...form, datum: e.target.value })}
              className="w-full px-4 py-3.5 bg-surface-low border-0 rounded-2xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>

          {/* Ingevuld door — Monteur picker */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-accent-gold mb-2">
              Ingevuld door *
            </label>
            {/* Monteur list */}
            <div className="space-y-2 mb-3">
              {monteurs?.map(monteur => (
                <button
                  key={monteur.id}
                  type="button"
                  onClick={() => setSelectedMonteur(monteur.naam)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl
                              border-2 text-left transition-all active:scale-[0.98] ${
                    selectedMonteur === monteur.naam
                      ? 'border-primary bg-primary/[0.08] text-primary'
                      : 'border-outline-variant/30 bg-surface-low text-on-surface hover:border-primary/40'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center
                                   text-sm font-black flex-shrink-0 ${
                    selectedMonteur === monteur.naam
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}>
                    {monteur.naam.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <span className="font-display font-semibold text-[15px] flex-1">
                    {monteur.naam}
                  </span>
                  {selectedMonteur === monteur.naam && (
                    <span className="material-symbols-rounded text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                  )}
                </button>
              ))}
              {monteurs?.length === 0 && !showAddNew && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Nog geen monteurs. Voeg er een toe hieronder.
                </div>
              )}
            </div>
            {/* Add new monteur */}
            {showAddNew ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Naam monteur"
                  value={newNaam}
                  onChange={e => setNewNaam(e.target.value)}
                  autoFocus
                  className="flex-1 px-4 py-3 bg-surface-low border border-outline-variant/30
                             rounded-xl text-sm focus:outline-none focus:ring-2
                             focus:ring-primary/25 transition"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newNaam.trim()) return;
                    const { error } = await supabase
                      .from('monteurs' as any)
                      .insert({ naam: newNaam.trim() } as any);
                    if (!error) {
                      setSelectedMonteur(newNaam.trim());
                      setNewNaam('');
                      setShowAddNew(false);
                      queryClient.invalidateQueries({ queryKey: ['monteurs'] });
                      toast.success(`${newNaam.trim()} toegevoegd`);
                    }
                  }}
                  className="px-4 py-3 bg-primary text-primary-foreground rounded-xl
                             font-bold text-sm active:scale-95 transition-transform
                             shadow-md shadow-primary/25"
                >
                  Toevoegen
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddNew(false); setNewNaam(''); }}
                  className="px-3 py-3 bg-surface-container rounded-xl text-sm
                             text-muted-foreground active:scale-95 transition-transform"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddNew(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3
                           rounded-xl border-2 border-dashed border-outline-variant/40
                           text-sm font-semibold text-muted-foreground
                           hover:border-primary/40 hover:text-primary transition-all
                           active:scale-[0.98]"
              >
                <span className="material-symbols-rounded text-lg">person_add</span>
                Voeg monteur toe
              </button>
            )}
          </div>

          {/* Type ruimte */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-accent-gold mb-3">Type ruimte</label>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, type_ruimte: "Compact Station" })}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all ${
                  form.type_ruimte === "Compact Station"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-surface-low text-text-primary hover:bg-surface"
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
                    : "bg-surface-low text-text-primary hover:bg-surface"
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
            <label className="block text-[11px] font-bold uppercase tracking-widest text-accent-gold mb-3">Extra opties</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between px-5 py-4 bg-surface-low rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-gold/[0.08] flex items-center justify-center">
                    <span className="material-symbols-rounded text-accent-gold text-xl">bolt</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">Vermogensveld aanwezig</span>
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
              <div className="flex items-center justify-between px-5 py-4 bg-surface-low rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-gold/[0.08] flex items-center justify-center">
                    <span className="material-symbols-rounded text-accent-gold text-xl">electrical_services</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">DA-kast aanwezig</span>
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
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold py-4 rounded-2xl shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.98] transition-all mt-2 disabled:opacity-50"
          >
            {loading ? "Opslaan..." : "Station opslaan"}
            <span className="material-symbols-rounded text-xl">save</span>
          </button>
        </div>
      </main>
    </div>
  );
}
