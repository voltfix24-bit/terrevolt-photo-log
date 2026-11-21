import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/to-rondes";
import { heeftBeheerSessie, zorgVoorBeheer } from "@/lib/require-pin";
import { Button } from "@/components/ui/button";
import { T } from "@/components/apple/Primitives";
import { toast } from "sonner";
import { bevestigConcept, leesConcept, nieuwConcept, verwijderConcept, type DossierDraft } from "@/lib/dossier-draft";

type Draft = DossierDraft;
export function DossierNotitie({ id, tekst, versie, refresh }: { id: string; tekst: string | null; versie: number; refresh: () => unknown }) {
  const key = `dossier-notitie:${id}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try { const old = leesConcept(key); if (old) return old; } catch { /* fall back to server */ }
    return nieuwConcept(tekst ?? "", versie);
  });
  const [melding, setMelding] = useState("");
  const [conflict, setConflict] = useState<Draft | null>(null);
  const [bezig, setBezig] = useState(false);
  const current = useRef(draft);
  const saving = useRef(false);
  const mounted = useRef(true);
  const failed = useRef<string | null>(null);
  const dirty = useRef(draft.tekst !== (tekst ?? ""));
  const save = useRef<(interactive?: boolean) => Promise<void>>(async () => {});
  const persist = (d: Draft) => {
    current.current = d; setDraft(d); dirty.current = true;
    try { localStorage.setItem(key, JSON.stringify(d)); } catch { toast.error("Notitie kon niet lokaal worden bewaard; verlaat deze pagina niet"); }
  };
  useEffect(() => {
    if (!dirty.current) { const d = nieuwConcept(tekst ?? "", versie); current.current = d; setDraft(d); }
  }, [tekst, versie]);
  save.current = async (interactive = false) => {
    if (!dirty.current || saving.current || conflict) return;
    saving.current = true; setBezig(true);
    const sent = { ...current.current };
    let succeeded = false;
    failed.current = sent.token;
    try {
      if (!navigator.onLine) { setMelding("Niet opgeslagen op kantoor — je tekst blijft op dit apparaat"); return; }
      if (!(interactive ? await zorgVoorBeheer() : await heeftBeheerSessie())) { setMelding("Beheer verlopen — ontgrendel om deze notitie op te slaan"); return; }
      const { data, error } = await db.rpc("case_notitie_opslaan", { _station_id: id, _versie: sent.versie, _tekst: sent.tekst });
      if (error || !data) { setMelding("Niet opgeslagen — controleer verbinding en ontgrendel beheer; je tekst blijft bewaard"); return; }
      if (data.conflict) { setConflict(nieuwConcept(data.tekst ?? "", Number(data.versie))); setMelding("Iemand heeft de notitie gewijzigd. Je eigen tekst is bewaard."); return; }
      const newer = current.current.token !== sent.token;
      bevestigConcept(key,sent,current.current,Number(data.versie));
      current.current = { ...current.current, versie: Number(data.versie) }; setDraft(current.current);
      dirty.current = newer;
      succeeded = true; failed.current = null;
      setMelding(newer ? "Nieuwe tekst nog niet opgeslagen" : ""); refresh();
    } catch { setMelding("Opslaan niet bevestigd — je tekst blijft bewaard"); }
    finally { saving.current = false; setBezig(false); }
    if (succeeded && mounted.current && dirty.current) void save.current();
  };
  useEffect(() => {
    mounted.current = true;
    const retry = () => { void save.current(); };
    window.addEventListener("beheer-veranderd", retry);
    return () => { mounted.current = false; window.removeEventListener("beheer-veranderd", retry); if (failed.current !== current.current.token) void save.current(); };
  }, [id]);
  return <div className="min-w-0 space-y-2">
    <textarea aria-label="Dossiernotitie" rows={3} maxLength={4000} value={draft.tekst} onChange={e => persist(nieuwConcept(e.target.value,current.current.versie))} onBlur={() => void save.current()} className="w-full rounded-lg border-0 bg-surface-container p-3 text-base text-foreground" />
    {melding && <div role="alert" className="text-sm break-words" style={{ color: T.danger }}>{melding}</div>}
    {conflict && <><div className="whitespace-pre-wrap break-words text-sm">Huidige kantoornotitie: {conflict.tekst || "(leeg)"}</div><Button variant="outline" onClick={() => { persist(nieuwConcept([conflict.tekst, current.current.tekst].filter(Boolean).join("\n"),conflict.versie)); setConflict(null); setMelding("Gecombineerde tekst controleren en opslaan"); }}>Teksten samenvoegen</Button><Button variant="ghost" onClick={() => { verwijderConcept(key,current.current.token); current.current = conflict; setDraft(conflict); dirty.current = false; setConflict(null); setMelding(""); }}>Kantoortekst gebruiken</Button></>}
    {(melding || dirty.current) && !conflict && <Button variant="outline" disabled={bezig} onClick={() => void save.current(true)}>Ontgrendelen en opslaan</Button>}
  </div>;
}