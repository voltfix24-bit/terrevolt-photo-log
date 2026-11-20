import { useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KnopLader } from "@/components/Laden";
import { T } from "@/components/apple/Primitives";
import { internetVereist } from "@/lib/internet";
import { maakCase } from "@/lib/case-service";
import { leesImportRijen, type ImportRij } from "@/lib/excel-cases";

const STATUS_TEKST: Record<ImportRij["status"], string> = { nieuw: "Nieuw", bestaat: "Bestaat al — overgeslagen", dubbel: "Dubbel in bestand — overgeslagen", onvolledig: "Onvolledig — overgeslagen" };

/** Basisimport: Van Gelder-cases (casenummer, casenaam, WV) uit .xlsx; elke case + ronde 1 via maak_case. */
export function ExcelImportDialog({ open, onOpenChange, bestaand }: { open: boolean; onOpenChange: (o: boolean) => void; bestaand: string[] }) {
  const qc = useQueryClient();
  const [rijen, setRijen] = useState<ImportRij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const nieuw = rijen?.filter((r) => r.status === "nieuw") ?? [];

  const kies = async (file?: File) => {
    setFout(null); setRijen(null);
    if (!file) return;
    try { setRijen(leesImportRijen((await readSheet(file)) as unknown[][], bestaand)); }
    catch (e) { setFout((e as Error).message || "Bestand kon niet gelezen worden"); }
  };
  const importeer = async () => {
    if (!internetVereist() || !nieuw.length) return;
    setBezig(true);
    let ok = 0; const mislukt: string[] = [];
    for (const r of nieuw) {
      const res = await maakCase({ casenummer: r.casenummer, casenaam: r.casenaam, wv: r.wv, uitvoerder: "van_gelder" });
      if ("fout" in res) mislukt.push(`${r.casenummer}: ${res.fout}`); else ok++;
    }
    setBezig(false);
    await Promise.all([qc.invalidateQueries({ queryKey: ["cases"] }), qc.invalidateQueries({ queryKey: ["url-index"] })]);
    if (mislukt.length) { setFout(`${ok} geïmporteerd, ${mislukt.length} mislukt: ${mislukt.slice(0, 3).join("; ")}`); return; }
    toast.success(`${ok} case${ok === 1 ? "" : "s"} geïmporteerd`);
    setRijen(null); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!bezig) { onOpenChange(o); if (!o) { setRijen(null); setFout(null); } } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importeren uit Excel</DialogTitle>
          <DialogDescription>Van Gelder-cases zonder foto's. Eerste rij met kolommen "Casenummer", "Casenaam" en optioneel "WV". Bestaande casenummers worden overgeslagen.</DialogDescription>
        </DialogHeader>
        <input type="file" accept=".xlsx" onChange={(e) => void kies(e.target.files?.[0])} />
        {rijen && (
          <div style={{ fontSize: 14, marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{nieuw.length} nieuw · {rijen.length - nieuw.length} overgeslagen</div>
            {rijen.slice(0, 200).map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderTop: `1px solid ${T.hairline}` }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span className="font-mono">{r.casenummer || "—"}</span> {r.casenaam}</span>
                <span style={{ color: r.status === "nieuw" ? T.green : T.subOnBg, whiteSpace: "nowrap" }}>{STATUS_TEKST[r.status]}</span>
              </div>
            ))}
          </div>
        )}
        {fout && <div role="alert" style={{ color: T.danger, fontSize: 14 }}>{fout}</div>}
        <button onClick={importeer} disabled={bezig || !nieuw.length} className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl disabled:opacity-50">
          {bezig ? <span className="inline-flex items-center justify-center gap-2"><KnopLader />Importeren</span> : `${nieuw.length} case${nieuw.length === 1 ? "" : "s"} importeren`}
        </button>
      </DialogContent>
    </Dialog>
  );
}
