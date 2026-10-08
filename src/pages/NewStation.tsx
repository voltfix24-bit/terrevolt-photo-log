// Variant 3a — Nieuw station, één formulier gegroepeerd
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GlassBar, Group, Hairline, NavText, PrimaryButton, Pressable, R, T, ROW_MIN, ROW_PAD_X, INSET_ROW } from "@/components/apple/Primitives";
import { toast } from "sonner";

const SUB = T.bodyOnBg;
type Monteur = { id: string; naam: string; created_at: string };
const initialen = (naam: string) => naam.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "0 5px 7px", fontSize: 13, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: SUB }}>{children}</div>;
}

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, padding: `10px ${ROW_PAD_X}px`, minHeight: ROW_MIN, boxSizing: "border-box" }}>
      <span style={{ fontSize: 13, color: SUB }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", border: 0, outline: "none", background: "transparent", fontSize: 17, color: T.rowText, padding: 0 };

function Schakelaar({ aan, onChange, label }: { aan: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={aan} aria-label={label} onClick={onChange} style={{ width: 52, height: 32, borderRadius: 16, border: 0, padding: 0, position: "relative", flexShrink: 0, background: aan ? T.green : T.softBorder, transition: "background 0.2s ease" }}>
      <span style={{ position: "absolute", top: 2, left: aan ? 22 : 2, width: 28, height: 28, borderRadius: 14, background: T.surface, boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s ease" }} />
    </button>
  );
}

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
  const [selectedMonteur, setSelectedMonteur] = useState("");
  const [monteurOpen, setMonteurOpen] = useState(false);
  const [monteurZoek, setMonteurZoek] = useState("");

  const { data: monteurs } = useQuery({
    queryKey: ["monteurs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("monteurs").select("*").order("naam", { ascending: true });
      if (error) throw error;
      return data as Monteur[];
    },
  });

  const zoek = monteurZoek.trim().toLowerCase();
  const gefilterd = (monteurs ?? []).filter((m) => !zoek || m.naam.toLowerCase().includes(zoek));
  const exact = (monteurs ?? []).some((m) => m.naam.toLowerCase() === zoek);

  const kiesMonteur = (naam: string) => { setSelectedMonteur(naam); setMonteurOpen(false); setMonteurZoek(""); };

  const voegMonteurToe = async () => {
    const naam = monteurZoek.trim();
    if (!naam) return;
    const { error } = await supabase.from("monteurs").insert({ naam });
    if (error) { toast.error("Monteur toevoegen mislukt"); return; }
    queryClient.invalidateQueries({ queryKey: ["monteurs"] });
    toast.success(`${naam} toegevoegd`);
    kiesMonteur(naam);
  };

  const handleSubmit = async () => {
    if (!form.naam_msr || !form.type_ruimte) { toast.error("Vul minimaal de naam MSR en type ruimte in"); return; }
    if (!selectedMonteur) { toast.error("Selecteer of voeg een monteur toe"); return; }
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
    if (error) { toast.error("Fout bij opslaan: " + error.message); return; }
    toast.success("Station opgeslagen");
    navigate(`/stations/${data.id}`);
  };

  const datumLabel = form.datum ? new Date(form.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "Kies datum";
  const typeKnop = (waarde: string, label: string, icon: string) => {
    const actief = form.type_ruimte === waarde;
    return (
      <Pressable
        onClick={() => setForm({ ...form, type_ruimte: waarde })}
        aria-pressed={actief}
        scale={0.97}
        style={{ flex: 1, minHeight: 52, borderRadius: 13, background: actief ? T.green : "transparent", color: actief ? T.surface : T.titleOnBg, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 600 }}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 20, color: actief ? T.surface : T.green }}>{icon}</span>
        {label}
      </Pressable>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      <GlassBar position="top">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 560, margin: "0 auto" }}>
          <NavText onClick={() => navigate("/")}>Annuleer</NavText>
          <span className="font-display" style={{ fontSize: 17, fontWeight: 600, color: T.titleOnBg }}>Nieuw station</span>
          <span style={{ width: 58 }} />
        </div>
      </GlassBar>

      <main style={{ flex: 1, width: "100%", maxWidth: 560, margin: "0 auto", padding: "20px 12px 24px", boxSizing: "border-box" }}>
        <Label>Station</Label>
        <Group>
          <Veld label="Naam MSR">
            <input style={inputStyle} value={form.naam_msr} onChange={(e) => setForm({ ...form, naam_msr: e.target.value })} placeholder="bv. Sint Martinusstraat 49NB" autoComplete="off" />
          </Veld>
          <Hairline inset={ROW_PAD_X} />
          <Veld label="Behuizingsnummer">
            <input style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }} value={form.behuizingsnummer} onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })} placeholder="bv. MSR-9920-X" autoComplete="off" autoCapitalize="characters" />
          </Veld>
          <Hairline inset={ROW_PAD_X} />
          <label style={{ position: "relative", minHeight: ROW_MIN, padding: `0 ${ROW_PAD_X}px`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 17, color: T.rowText }}>Datum</span>
            <span style={{ fontSize: 17, color: T.green }}>{datumLabel}</span>
            <input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} aria-label="Datum" style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%" }} />
          </label>
          <Hairline inset={ROW_PAD_X} />
          <Pressable onClick={() => setMonteurOpen(true)} scale={0.985} style={{ width: "100%", minHeight: ROW_MIN, padding: `0 ${ROW_PAD_X}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, textAlign: "left" }}>
            <span style={{ fontSize: 17, color: T.rowText }}>Monteur</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, color: selectedMonteur ? T.titleOnBg : SUB, minWidth: 0 }}>
              {selectedMonteur && <span style={{ width: 28, height: 28, borderRadius: 14, background: T.bg, color: T.green, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initialen(selectedMonteur)}</span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedMonteur || "Kies"}</span>
              <span className="material-symbols-rounded" style={{ fontSize: 19, color: T.subOnBg }}>chevron_right</span>
            </span>
          </Pressable>
        </Group>

        <Label>Type ruimte</Label>
        <div style={{ display: "flex", gap: 4, padding: 4, background: T.surface, borderRadius: R.group, marginBottom: 20 }}>
          {typeKnop("Compact Station", "Compact", "dashboard")}
          {typeKnop("Betreedbaar station", "Betreedbaar", "door_open")}
        </div>

        <Label>Aanwezig</Label>
        <Group style={{ marginBottom: 8 }}>
          <div style={{ minHeight: ROW_MIN, padding: `0 ${ROW_PAD_X}px`, display: "flex", alignItems: "center", gap: 14 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 23, color: T.green }}>bolt</span>
            <span style={{ flex: 1, fontSize: 17, color: T.rowText }}>Vermogensveld</span>
            <Schakelaar label="Vermogensveld aanwezig" aan={form.vermogensveld} onChange={() => setForm({ ...form, vermogensveld: !form.vermogensveld })} />
          </div>
          <Hairline inset={INSET_ROW} />
          <div style={{ minHeight: ROW_MIN, padding: `0 ${ROW_PAD_X}px`, display: "flex", alignItems: "center", gap: 14 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 23, color: T.green }}>electrical_services</span>
            <span style={{ flex: 1, fontSize: 17, color: T.rowText }}>DA-kast</span>
            <Schakelaar label="DA-kast aanwezig" aan={form.da_kast} onChange={() => setForm({ ...form, da_kast: !form.da_kast })} />
          </div>
        </Group>
        <div style={{ padding: "0 5px", fontSize: 14, color: SUB, lineHeight: 1.45 }}>Bepaalt welke foto's gevraagd worden.</div>
      </main>

      <GlassBar>
        <PrimaryButton onClick={handleSubmit} disabled={loading}>
          {loading ? "Opslaan…" : "Opslaan en foto's maken"}
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span>
        </PrimaryButton>
      </GlassBar>

      <Sheet open={monteurOpen} onOpenChange={setMonteurOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[20px] border-0 bg-white px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Wie vult dit in?</SheetTitle>
            <SheetDescription>Kies een monteur of typ een nieuwe naam.</SheetDescription>
          </SheetHeader>
          <label style={{ position: "relative", display: "block", marginTop: 16 }}>
            <span className="material-symbols-rounded" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: SUB }}>search</span>
            <input value={monteurZoek} onChange={(e) => setMonteurZoek(e.target.value)} placeholder="Zoek of typ naam" autoFocus style={{ width: "100%", minHeight: 52, border: 0, outline: "none", borderRadius: R.small, background: T.soft, padding: "0 14px 0 44px", fontSize: 17, color: T.rowText }} />
          </label>
          <div style={{ marginTop: 10 }}>
            {gefilterd.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <Hairline inset={58} />}
                <Pressable onClick={() => kiesMonteur(m.naam)} scale={0.985} style={{ width: "100%", minHeight: 56, display: "flex", alignItems: "center", gap: 14, padding: "0 4px", textAlign: "left" }}>
                  <span style={{ width: 36, height: 36, borderRadius: 18, background: T.bg, color: T.green, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initialen(m.naam)}</span>
                  <span style={{ flex: 1, fontSize: 17, color: T.rowText }}>{m.naam}</span>
                  {m.naam === selectedMonteur && <span className="material-symbols-rounded" style={{ fontSize: 22, color: T.green }}>check</span>}
                </Pressable>
              </div>
            ))}
            {zoek && !exact && (
              <Pressable onClick={voegMonteurToe} scale={0.985} style={{ width: "100%", minHeight: 56, display: "flex", alignItems: "center", gap: 14, padding: "0 4px", marginTop: 6, textAlign: "left", color: T.green }}>
                <span style={{ width: 36, height: 36, borderRadius: 18, background: T.soft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 20 }}>person_add</span>
                </span>
                <span style={{ fontSize: 17, fontWeight: 600 }}>“{monteurZoek.trim()}” toevoegen</span>
              </Pressable>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
