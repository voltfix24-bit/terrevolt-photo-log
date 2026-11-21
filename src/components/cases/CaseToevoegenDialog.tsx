import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { KnopLader } from "@/components/Laden";
import { Pressable, T } from "@/components/apple/Primitives";
import { internetVereist } from "@/lib/internet";
import { maakCase, valideerCase, casePayload } from "@/lib/case-service";
import { casesUrl } from "@/lib/urls";
import type { Uitvoerder } from "@/lib/to-rondes";

const veld = "w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary/25 transition";

/** Case zonder fotowerk: alleen Cases & TO, met TO-ronde 1 (open). Voor fotowerk blijft "Nieuw station" de route. */
export function CaseToevoegenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ casenummer: "", casenaam: "", uitvoerder: "van_gelder" as Uitvoerder, wv: "", notitie: "" });
  const request = useRef<{ key: string; id: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const opslaan = async () => {
    if (!internetVereist()) return;
    const v = valideerCase(f);
    if (v) { setFout(v); return; }
    setBezig(true); setFout(null);
    const key = JSON.stringify(casePayload(f));
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const r = await maakCase(f,request.current.id);
    setBezig(false);
    if ("fout" in r) { setFout(r.fout); return; }
    await Promise.all([qc.invalidateQueries({ queryKey: ["cases"] }), qc.invalidateQueries({ queryKey: ["url-index"] })]);
    toast.success("Case toegevoegd");
    onOpenChange(false);
    setF({ casenummer: "", casenaam: "", uitvoerder: "van_gelder", wv: "", notitie: "" });
    navigate(casesUrl({ id: (r as { id: string }).id, casenummer: f.casenummer.trim(), casenaam: f.casenaam.trim(), uitvoerder: f.uitvoerder }));
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!bezig) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Case toevoegen</DialogTitle>
          <DialogDescription>Alleen voor Cases &amp; TO — zonder foto's, rapport of SharePoint. Voor fotowerk gebruik je "Nieuw station".</DialogDescription>
        </DialogHeader>
        <fieldset disabled={bezig} className="space-y-3">
          <div><Label>Casenummer *</Label><input className={veld} value={f.casenummer} onChange={(e) => setF({ ...f, casenummer: e.target.value })} /></div>
          <div><Label>Casenaam *</Label><input className={veld} value={f.casenaam} onChange={(e) => setF({ ...f, casenaam: e.target.value })} /></div>
          <div>
            <Label>Uitvoerder</Label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {([["van_gelder", "Van Gelder"], ["terrevolt", "TerreVolt"]] as const).map(([k, l]) => (
                <Pressable key={k} onClick={() => setF({ ...f, uitvoerder: k })} style={{ minHeight: 40, padding: "0 14px", borderRadius: 20, fontSize: 15, fontWeight: 600, border: `1px solid ${f.uitvoerder === k ? T.green : T.hairline}`, background: f.uitvoerder === k ? T.green : T.surface, color: f.uitvoerder === k ? T.surface : T.titleOnBg }}>{l}</Pressable>
              ))}
            </div>
          </div>
          <div><Label>WV (werkverantwoordelijke)</Label><input className={veld} value={f.wv} onChange={(e) => setF({ ...f, wv: e.target.value })} /></div>
          <div><Label>Notitie</Label><textarea className={veld} rows={3} value={f.notitie} onChange={(e) => setF({ ...f, notitie: e.target.value })} /></div>
          {fout && <div role="alert" style={{ color: T.danger, fontSize: 14 }}>{fout}</div>}
          <button onClick={opslaan} disabled={bezig} className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50">
            {bezig ? <span className="inline-flex items-center justify-center gap-2"><KnopLader />Toevoegen</span> : "Case toevoegen"}
          </button>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
