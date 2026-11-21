import { useState } from "react";
import { CameraOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { T } from "@/components/apple/Primitives";
import { internetVereist } from "@/lib/internet";
import { wijzigCase } from "@/lib/case-service";
import type { Uitvoerder } from "@/lib/to-rondes";

const ANDERS = "__anders__";
const sel = { minHeight: 44, maxWidth: "100%", minWidth: 0, borderRadius: 10, border: `1px solid ${T.hairline}`, background: T.surface, padding: "0 10px", fontSize: 16, fontWeight: 600, color: T.titleOnBg } as const;
export const OVERSTAP_TEKST = "Deze case wordt een TerreVolt-station en verschijnt dan op de startpagina als station zonder foto's, waar het fotowerk alsnog moet gebeuren. Er gaat niets verloren. Doorgaan?";

/** Inline Uitvoerder + WV (werkverantwoordelijke) op een Van Gelder-casepagina; slaat direct op. */
export function VgVelden({ id, uitvoerder, wv, namen, bevestig = (t: string) => window.confirm(t) }: { id: string; uitvoerder: Uitvoerder; wv: string | null; namen: string[]; bevestig?: (t: string) => boolean }) {
  const qc = useQueryClient();
  const [anders, setAnders] = useState(false);
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [bezig, setBezig] = useState(false);
  const opslaan = async (patch: { uitvoerder?: Uitvoerder; wv?: string | null }) => {
    if (!internetVereist()) return false;
    setBezig(true);
    const fout = await wijzigCase(id, patch);
    setBezig(false);
    if (fout) { toast.error(fout); return false; }
    await Promise.all([qc.invalidateQueries({ queryKey: ["cases"] }), qc.invalidateQueries({ queryKey: ["url-index"] })]);
    toast.success("Opgeslagen");
    return true;
  };
  const kiesUitvoerder = (u: Uitvoerder) => {
    if (u === uitvoerder) return;
    if (u === "terrevolt" && !bevestig(OVERSTAP_TEKST)) return;
    void opslaan({ uitvoerder: u });
  };
  const opties = wv && !namen.includes(wv) ? [wv, ...namen] : namen;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: T.subOnBg }}>Uitvoerder
          <select aria-label="Uitvoerder" value={uitvoerder} disabled={bezig} onChange={(e) => kiesUitvoerder(e.target.value as Uitvoerder)} style={sel}>
            <option value="terrevolt">TerreVolt</option>
            <option value="van_gelder">Van Gelder</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", maxWidth: "100%", minWidth: 0, gap: 4, fontSize: 12, fontWeight: 600, color: T.subOnBg }}>WV
          {anders ? (
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input aria-label="Naam werkverantwoordelijke" autoFocus value={nieuweNaam} onChange={(e) => setNieuweNaam(e.target.value)} placeholder="Naam werkverantwoordelijke" style={{ ...sel, fontWeight: 500 }} />
              <button disabled={bezig || !nieuweNaam.trim()} onClick={async () => { if (await opslaan({ wv: nieuweNaam })) { setAnders(false); setNieuweNaam(""); } }} style={{ ...sel, background: T.green, color: T.surface, border: 0 }}>Opslaan</button>
              <button onClick={() => setAnders(false)} style={{ ...sel, border: 0, background: "transparent", color: T.green }}>Annuleer</button>
            </span>
          ) : (
            <select aria-label="WV" value={wv ?? ""} disabled={bezig} onChange={(e) => (e.target.value === ANDERS ? setAnders(true) : void opslaan({ wv: e.target.value || null }))} style={sel}>
              <option value="">—</option>
              {opties.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={ANDERS}>Andere naam invoeren</option>
            </select>
          )}
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.subOnBg }}>
        <CameraOff size={16} aria-hidden />Geen fotowerk: deze case is door Van Gelder uitgevoerd
      </div>
    </div>
  );
}
