// On hold zetten (dialoog) en de paarse balk bovenaan de casepagina
import { useState } from "react";
import { PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pressable, T } from "@/components/apple/Primitives";
import { KnopLader } from "@/components/Laden";
import { zorgVoorBeheer } from "@/lib/require-pin";
import { internetVereist } from "@/lib/internet";
import { HOLD_KLEUR, HOLD_PARTIJEN, HOLD_PARTIJ_NAAM, hervat, holdDatum, holdPartij, zetOnHold, type HoldVelden, type OnHoldPartij } from "@/lib/on-hold";

const veld = { border: 0, borderRadius: 10, background: T.soft, padding: "12px 14px", font: "inherit", fontSize: 16, color: T.titleOnBg, outline: "none", width: "100%" } as const;

export function OnHoldKnop({ id }: { id: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reden, setReden] = useState("");
  const [partij, setPartij] = useState<OnHoldPartij | null>(null);
  const [tot, setTot] = useState("");
  const [bezig, setBezig] = useState(false);
  const kan = reden.trim() && partij && !bezig;
  const opslaan = async () => {
    if (!kan || !partij || !internetVereist() || !await zorgVoorBeheer()) return;
    setBezig(true);
    const fout = await zetOnHold(id, { reden, partij, tot: tot || null });
    setBezig(false);
    if (fout) return toast.error(fout);
    await qc.invalidateQueries({ queryKey: ["cases"] });
    setOpen(false); setReden(""); setPartij(null); setTot("");
  };
  return (
    <>
      <Pressable onClick={() => setOpen(true)} scale={0.97} style={{ marginLeft: "auto", minHeight: 40, padding: "0 14px", borderRadius: 20, fontSize: 15, fontWeight: 600, background: HOLD_KLEUR.bg, color: HOLD_KLEUR.fg, display: "flex", alignItems: "center", gap: 6 }}>
        <PauseCircle size={17} />On hold zetten
      </Pressable>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>On hold zetten</DialogTitle><DialogDescription>On hold geldt vanaf vandaag.</DialogDescription></DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>Reden
              <textarea rows={2} value={reden} maxLength={1000} onChange={(e) => setReden(e.target.value)} placeholder="Bijv. wacht op vergunning gemeente" style={{ ...veld, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>Bij wie ligt het
              <div role="radiogroup" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {HOLD_PARTIJEN.map((p) => (
                  <Pressable key={p} role="radio" aria-checked={partij === p} onClick={() => setPartij(p)} scale={0.97} style={{ minHeight: 38, padding: "0 12px", borderRadius: 9, fontSize: 14, fontWeight: 600, background: partij === p ? HOLD_KLEUR.fg : T.soft, color: partij === p ? "#fff" : T.titleOnBg }}>{HOLD_PARTIJ_NAAM[p]}</Pressable>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>Verwachte hervatting <span style={{ fontWeight: 400, color: T.bodyOnBg }}>(optioneel)</span>
              <input type="date" value={tot} onChange={(e) => setTot(e.target.value)} style={veld} />
            </label>
            <Pressable onClick={opslaan} disabled={!kan} scale={0.97} style={{ minHeight: 46, borderRadius: 12, fontSize: 16, fontWeight: 700, background: kan ? HOLD_KLEUR.fg : T.soft, color: kan ? "#fff" : T.bodyOnBg, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {bezig ? <KnopLader /> : <PauseCircle size={18} />}On hold zetten
            </Pressable>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OnHoldBalk({ id, station }: { id: string; station: HoldVelden & { dossier_notitie?: string | null } }) {
  const qc = useQueryClient();
  const [bezig, setBezig] = useState(false);
  const go = async () => {
    if (!internetVereist() || !await zorgVoorBeheer()) return;
    setBezig(true);
    const fout = await hervat(id, station);
    setBezig(false);
    if (fout) return toast.error(fout);
    qc.invalidateQueries({ queryKey: ["cases"] });
  };
  const delen = [`On hold sinds ${station.on_hold_sinds ? holdDatum(station.on_hold_sinds) : "?"}`, station.on_hold_reden, `bij ${HOLD_PARTIJ_NAAM[holdPartij(station)]}`];
  if (station.on_hold_tot) delen.push(`verwacht ${holdDatum(station.on_hold_tot)}`);
  return (
    <div role="status" style={{ background: HOLD_KLEUR.bg, color: HOLD_KLEUR.fg, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <PauseCircle size={20} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 200, fontSize: 15, fontWeight: 600 }}>{delen.filter(Boolean).join(" · ")}</span>
      <Pressable onClick={go} disabled={bezig} scale={0.97} style={{ minHeight: 38, padding: "0 14px", borderRadius: 19, fontSize: 14, fontWeight: 700, background: HOLD_KLEUR.fg, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
        {bezig && <KnopLader />}Hervatten
      </Pressable>
    </div>
  );
}
