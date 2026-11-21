import { useEffect, useMemo, useState, useRef } from "react";
import { readSheet } from "read-excel-file/browser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KnopLader } from "@/components/Laden";
import { T } from "@/components/apple/Primitives";
import { internetVereist } from "@/lib/internet";
import { importCase, alleCaseNummers, casePayload } from "@/lib/case-service";
import { zorgVoorBeheer } from "@/lib/require-pin";
import { Button } from "@/components/ui/button";
import { importBatch, importTellingen, resterendeImport, previewPagina, type RijUitkomst } from "@/lib/import-batch";
import { TO_STATUS } from "@/lib/to-rondes";
import {
  VELDEN, VELD_LABEL, bouwPreview, celTekst, importeerbaar, isDubbelHerkend, ontbrekendeVerplicht, parseTsv, startMapping, zetMapping,
  type ImportPreviewRij, type ImportVeld, type Mapping,
} from "@/lib/case-import";

const ORANJE = "#9A4A06", ORANJE_BG = "#FDEFE4";
type Resultaat = Record<number, RijUitkomst>;

/** Van Gelder-cases plakken uit Excel (TSV, primair) of optioneel .xlsx; elke case + rondes via maak_case (atomair). Niets wordt lokaal bewaard. */
export function ExcelImportDialog({ open, onOpenChange, bestaand }: { open: boolean; onOpenChange: (o: boolean) => void; bestaand: string[] }) {
  const qc = useQueryClient();
  const [tekst, setTekst] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [serial, setSerial] = useState(false);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [res, setRes] = useState<Resultaat>({});
  const [pagina, setPagina] = useState(0);
  const requests = useRef(new Map<string,string>());
  const vorigeOpen = useRef(open);
  useEffect(() => { if (vorigeOpen.current && !open) { requests.current.clear(); setTekst(""); setGrid([]); setMapping([]); setRes({}); setFout(null); setPagina(0); } vorigeOpen.current=open; },[open]);
  const { data: nummers, isPending: nummersLaden, error: nummersFout } = useQuery({ queryKey: ["alle-case-nummers"], queryFn: () => alleCaseNummers(), enabled: open });

  const laad = (g: string[][], xlsx: boolean) => { setGrid(g); setSerial(xlsx); setMapping(g.length ? startMapping(g[0]) : []); setRes({}); setPagina(0); setFout(null); };
  const plak = (t: string) => { setTekst(t); try { laad(parseTsv(t),false); } catch(e) { laad([],false); setFout((e as Error).message); } };
  const kiesBestand = async (file?: File) => {
    if (!file || bezig) return;
    if (file.size > 10*1024*1024) { setFout("Bestand is groter dan 10 MB"); return; }
    try { const rows = (await readSheet(file)) as unknown[][]; const g = rows.map((r) => r.map(celTekst)).filter((r) => r.some(Boolean)); setTekst(""); laad(g, true); }
    catch { setFout("Bestand kon niet gelezen worden"); }
  };
  const reset = () => { requests.current.clear(); setTekst(""); laad([], false); };

  const koppen = grid[0] ?? [];
  const mist = ontbrekendeVerplicht(mapping);
  const preview = useMemo(() => (grid.length > 1 && !mist.length ? bouwPreview(grid, mapping, nummers ?? bestaand, { excelSerial: serial }) : []), [grid, mapping, bestaand, nummers, serial, mist.length]);
  const payloadVan = (r: ImportPreviewRij) => ({ casenummer: r.casenummer, casenaam: r.casenaam, wv: r.wv, notitie: r.notitie, uitvoerder: "van_gelder" as const, ronde: r.ronde, toStatus: r.status, ingediendOp: r.ingediend_op, onHold: r.on_hold, onHoldReden: r.on_hold_reden });
  const requestKey = (r: ImportPreviewRij) => JSON.stringify([mapping,r.regel,casePayload(payloadVan(r))]);
  const teDoen = resterendeImport(preview,res,r => requests.current.has(requestKey(r)));
  const tel = importTellingen(preview,res);
  const waarschuwingen = preview.filter((r) => r.klasse === "waarschuwing");
  const dubbelKolom = koppen.some((_, i) => isDubbelHerkend(koppen, mapping, i));

  const importeer = async () => {
    if (bezig || !internetVereist() || !teDoen.length || !nummers || nummersFout) return;
    setBezig(true); setFout(null);
    try {
      if (!await zorgVoorBeheer()) { setFout("Import gepauzeerd — ontgrendel om verder te gaan."); return; }
      const result = await importBatch(teDoen,res,async r => {
        const payload = payloadVan(r);
        const key = requestKey(r);
        let id = requests.current.get(key);
        if (!id) { id = crypto.randomUUID(); requests.current.set(key,id); }
        return importCase(payload,id);
      },() => navigator.onLine,setRes);
      const saved = Object.values(result.res).filter(x => x.status === "aangemaakt" || x.status === "replay").length;
      const skipped = Object.values(result.res).filter(x => x.status === "bestaat").length;
      const failed = Object.values(result.res).filter(x => x.status === "mislukt").length;
      if (result.gepauzeerd || failed) setFout(`${saved} opgeslagen · ${skipped} overgeslagen · ${failed} mislukt. ${result.gepauzeerd ? "Import gepauzeerd; herstel verbinding/beheer en hervat." : "Probeer alleen de resterende rijen opnieuw."}`);
      else toast.success(`${saved} opgeslagen · ${skipped} overgeslagen`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["cases"] }), qc.invalidateQueries({ queryKey: ["url-index"] })]);
    } catch { setFout("Import onderbroken — resultaten zijn behouden. Probeer de resterende rijen opnieuw."); }
    finally { setBezig(false); }
  };
  const wijzigMapping = (m: Mapping) => { if (!bezig) { setMapping(m); setRes({}); setPagina(0); } };

  const kleurRij = (r: ImportPreviewRij) => {
    const x = res[r.regel];
    if (x?.status === "aangemaakt" || x?.status === "replay") return { icoon: "check_circle", kleur: T.green, tekst: x.status === "replay" ? "Opgeslagen (herhaald bevestigd)" : "Aangemaakt" };
    if (x?.status === "bestaat") return { icoon: "block", kleur: T.subOnBg, tekst: "Bestaat al — overgeslagen" };
    if (x?.status === "mislukt") return { icoon: "error", kleur: T.danger, tekst: x.fout ?? "Mislukt" };
    if (r.klasse === "nieuw") return { icoon: "check_circle", kleur: T.green, tekst: "Nieuw" };
    if (r.klasse === "waarschuwing") return { icoon: "warning", kleur: ORANJE, tekst: r.redenen.join(" · ") };
    if (r.klasse === "bestaat") return { icoon: "block", kleur: T.subOnBg, tekst: r.redenen[0] };
    return { icoon: "error", kleur: T.danger, tekst: r.redenen.join(" · ") };
  };
  const th = { textAlign: "left", padding: "6px 8px", fontSize: 12, fontWeight: 700, color: T.subOnBg, whiteSpace: "nowrap" } as const;
  const td = { padding: "6px 8px", fontSize: 13, borderTop: `1px solid ${T.hairline}`, verticalAlign: "top" } as const;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!bezig) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="flex max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-5 pb-3 pt-5 pr-14 sm:px-6">
          <DialogTitle>Van Gelder-cases importeren</DialogTitle>
          <DialogDescription>Kopieer de rijen in Excel, inclusief de kopregel, en plak ze hieronder.</DialogDescription>
        </DialogHeader>
        {/* Alleen het middendeel scrolt; telling en acties blijven in de vaste footer bereikbaar. */}
        <div data-testid="import-midden" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6 [&>*]:shrink-0">
        <textarea aria-label="Geplakte Excel-rijen" value={tekst} onChange={(e) => plak(e.target.value)} rows={7} spellCheck={false} disabled={bezig}
          placeholder={"Casenummer\tCasenaam\tTO-status\tRonde\tWV"}
          className="w-full min-w-0 font-mono" style={{ fontSize: 16, padding: 12, borderRadius: 12, border: `1px solid ${T.hairline}`, background: T.soft, whiteSpace: "pre", overflowX: "auto" }} />
        <label className="min-w-0" style={{ fontSize: 14, color: T.bodyOnBg }}>Of kies een .xlsx-bestand: <input className="w-full min-w-0" type="file" accept=".xlsx" disabled={bezig} onChange={(e) => void kiesBestand(e.target.files?.[0])} /></label>

        {koppen.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Kolommen">
            {koppen.map((k, i) => {
              const v = mapping[i];
              if (v) return (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", padding: "3px 4px 3px 10px", borderRadius: 14, fontSize: 14, fontWeight: 600, background: "#E3EFE0", color: T.green }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{k || `Kolom ${i + 1}`} → {VELD_LABEL[v]}</span>
                  <Button aria-label={`${k} ontkoppelen`} disabled={bezig} onClick={() => wijzigMapping(zetMapping(mapping, i, null))} variant="ghost" style={{ padding: 0, width: 44, minWidth: 44, height: 44, flexShrink: 0, margin: "-8px -2px -8px 0", color: T.green }}>×</Button>
                </span>
              );
              return (
                <span key={i} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "0 6px", maxWidth: "100%", padding: "3px 6px 3px 10px", borderRadius: 14, fontSize: 14, fontWeight: 600, background: ORANJE_BG, color: ORANJE }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{k || `Kolom ${i + 1}`}{isDubbelHerkend(koppen, mapping, i) ? " (dubbel)" : ""}</span>
                  <select aria-label={`Kolom ${k} koppelen`} value="" disabled={bezig} onChange={(e) => wijzigMapping(zetMapping(mapping, i, (e.target.value || null) as ImportVeld | null))} style={{ background: "transparent", color: ORANJE, fontWeight: 600, fontSize: 16, minHeight: 44, maxWidth: "100%" }}>
                    <option value="">kies kolom…</option>
                    {VELDEN.map((f) => <option key={f} value={f}>{VELD_LABEL[f]}{mapping.includes(f) ? " (vervangt)" : ""}</option>)}
                    <option value="">negeren</option>
                  </select>
                </span>
              );
            })}
          </div>
        )}
        {dubbelKolom && <div style={{ fontSize: 13, color: ORANJE }}>Meerdere kolommen herkend voor hetzelfde veld: alleen de eerste is gekoppeld. Kies zelf welke je wilt gebruiken.</div>}
        {grid.length === 1 && <div style={{ fontSize: 13, color: ORANJE }}>Alleen een kopregel gevonden — plak ook de rijen eronder.</div>}
        {grid.length > 0 && mist.length > 0 && <div role="alert" style={{ fontSize: 13, color: T.danger }}>Geen kopregel herkend voor {mist.map((m) => VELD_LABEL[m]).join(" en ")}. Plak de rijen inclusief kopregel, of koppel de kolom hierboven.</div>}

        {preview.length > 0 && (
          <div style={{ overflowX: "auto", minWidth: 0, maxWidth: "100%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Controle</th><th style={th}>Casenr.</th><th style={th}>Casenaam</th><th style={th}>TO-status</th><th style={th}>Ronde</th><th style={th}>WV</th></tr></thead>
              <tbody>
                {previewPagina(preview,pagina).map((r) => {
                  const k = kleurRij(r), s = TO_STATUS[r.status];
                  return (
                    <tr key={r.regel}>
                      <td style={{ ...td, color: k.kleur, fontWeight: 600, maxWidth: 220 }}><span style={{ display: "inline-flex", gap: 4, alignItems: "flex-start" }}><span className="material-symbols-rounded" style={{ fontSize: 16 }}>{k.icoon}</span>{k.tekst}</span></td>
                      <td style={{ ...td }} className="font-mono">{r.casenummer || "—"}</td>
                      <td style={td}>{r.casenaam || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: s.dot }} />{s.label}</span></td>
                      <td style={td}>{r.ronde}</td>
                      <td style={td}>{r.wv || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-2 py-2">
              <Button variant="ghost" className="h-11 w-11 shrink-0" aria-label="Vorige previewpagina" disabled={bezig || pagina === 0} onClick={() => setPagina(pagina-1)}>←</Button>
              <span>Rijen {pagina*100+1}–{Math.min((pagina+1)*100,preview.length)} van {preview.length}</span>
              <Button variant="ghost" className="h-11 w-11 shrink-0" aria-label="Volgende previewpagina" disabled={bezig || (pagina+1)*100>=preview.length} onClick={() => setPagina(pagina+1)}>→</Button>
            </div>
            {waarschuwingen.length > 0 && <div style={{ fontSize: 13, color: ORANJE, marginTop: 8 }}>{waarschuwingen.length} rij{waarschuwingen.length === 1 ? "" : "en"} met waarschuwing: onbekende status wordt TO open. Controleer dit vóór importeren.</div>}
          </div>
        )}
        {nummersLaden && open && <div className="flex items-center gap-2"><KnopLader />Casenummers controleren…</div>}
        {nummersFout && <div role="alert">Bestaande casenummers konden niet worden gecontroleerd. <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["alle-case-nummers"] })}>Opnieuw proberen</Button></div>}
        {fout && <div role="alert" style={{ overflowWrap: "anywhere", color: T.danger, fontSize: 14 }}>{fout}</div>}
        </div>

        <div data-testid="import-footer" className="shrink-0 px-5 pt-3 sm:px-6" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: `1px solid ${T.hairline}`, background: T.surface, paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
          <span aria-live="polite" style={{ flex: "1 1 220px", fontSize: 14, fontWeight: 600 }}>{tel.opgeslagen} opgeslagen · {teDoen.length} resterend · {tel.bestaat} bestaat al · {tel.fout} fout</span>
          <Button onClick={() => { if (!bezig) { reset(); onOpenChange(false); } }} disabled={bezig} className="min-h-[48px] px-4 rounded-xl font-semibold" variant="outline" style={{ border: `1px solid ${T.hairline}` }}>Annuleren</Button>
          <Button onClick={importeer} disabled={bezig || !teDoen.length || !nummers || !!nummersFout} className="min-h-[48px] bg-primary text-primary-foreground font-bold px-4 rounded-xl disabled:opacity-50">
            {bezig ? <span className="inline-flex items-center gap-2"><KnopLader />Importeren</span> : `${teDoen.length} case${teDoen.length === 1 ? "" : "s"} importeren`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
