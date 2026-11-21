import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { R, T } from "@/components/apple/Primitives";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { zorgVoorBeheer } from "@/lib/require-pin";
import { lokaleNotitie, lokaleNotitieStatus, verstuurNotitiesNaBeheer, type NotitieStatus } from "@/lib/notities";

export const NOTITIE_CHIPS = ["Niet bereikbaar", "Niet aanwezig", "Defect", "Volgt later", "Zie foto"];
export const SKIP_CHIPS = ["Niet aanwezig in dit station", "Niet bereikbaar", "Geen toegang", "Volgt bij TO-ronde"];

/** Volgt het zichtbare deel van het scherm (toetsenbord op iOS) via visualViewport. */
function useZichtbaar() {
  const [vv, setVv] = useState(() => ({ bottom: 0, hoogte: typeof window !== "undefined" ? window.innerHeight : 800 }));
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const upd = () => setVv({ bottom: Math.max(0, window.innerHeight - v.height - v.offsetTop), hoogte: v.height });
    upd();
    v.addEventListener("resize", upd); v.addEventListener("scroll", upd);
    return () => { v.removeEventListener("resize", upd); v.removeEventListener("scroll", upd); };
  }, []);
  return vv;
}

type Props = {
  soort: "notitie" | "skip";
  titel: string;
  begin: string;
  stationId?: string;
  categorie?: string;
  onClose: () => void;
  /** notitie: autosave tijdens typen; skip: alleen bij Opslaan */
  onSave: (tekst: string) => Promise<NotitieStatus | void> | void;
};

export function NotitieSheet({ soort, titel, begin, stationId, categorie, onClose, onSave }: Props) {
  const [tekst, setTekst] = useState(begin);
  const [status, setStatus] = useState<"" | "bezig" | NotitieStatus | "fout">("");
  const [ontgrendelen, setOntgrendelen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const laatst = useRef(begin);
  const hadLokaleNotitie = useRef(false);
  const { bottom, hoogte } = useZichtbaar();
  const chips = soort === "skip" ? SKIP_CHIPS : NOTITIE_CHIPS;
  const verplicht = soort === "skip";

  // Groeit mee tot ~40% van de zichtbare hoogte, daarna scrollen
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, Math.max(96, hoogte * 0.4))}px`;
  }, [tekst, hoogte]);

  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (soort !== "notitie" || !stationId || !categorie) return;
    const check = () => {
      try {
        const lokaal = lokaleNotitie(stationId, categorie);
        if (lokaal === tekst) hadLokaleNotitie.current = true;
        if (lokaal === tekst || (lokaal === undefined && laatst.current === tekst && hadLokaleNotitie.current)) {
          setStatus(lokaleNotitieStatus(stationId, categorie));
          if (lokaal === undefined) hadLokaleNotitie.current = false;
        }
      } catch { setStatus("fout"); }
    };
    check();
    window.addEventListener("notitie-wachtrij-veranderd", check);
    return () => window.removeEventListener("notitie-wachtrij-veranderd", check);
  }, [soort, stationId, categorie, tekst, begin]);

  const herstelBeheer = async () => {
    setOntgrendelen(true);
    try {
      if (!await zorgVoorBeheer("Notitie versturen")) return;
      await verstuurNotitiesNaBeheer();
      if (stationId && categorie) setStatus(lokaleNotitieStatus(stationId, categorie));
    } catch { toast.error("Notitie blijft lokaal bewaard — probeer opnieuw"); }
    finally { setOntgrendelen(false); }
  };

  // Autosave (alleen notitie), debounce 700 ms
  useEffect(() => {
    if (soort !== "notitie" || tekst === laatst.current) return;
    const t = setTimeout(async () => {
      setStatus("bezig");
      try {
        const r = await onSave(tekst);
        laatst.current = tekst;
        setStatus(typeof r === "string" ? r : "online");
      } catch (e) {
        setStatus("fout");
        toast.error(e instanceof Error ? e.message : "Notitie niet bewaard — probeer opnieuw");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [tekst, soort, onSave]);

  const voegIn = (c: string) => {
    setTekst((t) => (t.trim() ? `${t.replace(/\s+$/, "")} ${c}` : c));
    setTimeout(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
  };

  const opslaan = async () => {
    if (verplicht && !tekst.trim()) return;
    try {
      const r = await onSave(tekst);
      laatst.current = tekst;
      if (r === "beheer") { setStatus("beheer"); return; }
      onClose();
    } catch (e) {
      setStatus("fout");
      toast.error(e instanceof Error ? e.message : "Niet bewaard — probeer opnieuw");
    }
  };
  const annuleren = async () => {
    // Notitie: terugzetten naar de begintekst als er al tussentijds is opgeslagen
    try {
      if (soort === "notitie" && status !== "beheer" && (laatst.current !== begin || status === "bezig")) await onSave(begin);
      onClose();
    } catch (e) {
      setStatus("fout");
      toast.error(e instanceof Error ? e.message : "Niet bewaard — probeer opnieuw");
    }
  };

  return (
    <div className="fixed inset-0 z-[120]" style={{ color: T.rowText }} role="dialog" aria-modal="true" aria-label={titel}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => void annuleren()} />
      <div
        data-testid="notitie-sheet"
        style={{ position: "absolute", left: 0, right: 0, bottom, maxHeight: hoogte - 12, display: "flex", flexDirection: "column", background: T.surface, borderRadius: "18px 18px 0 0", paddingBottom: bottom > 0 ? 10 : "max(14px, env(safe-area-inset-bottom))", transition: "bottom 0.12s ease-out", maxWidth: 768, margin: "0 auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 4px", flexShrink: 0 }}>
          <button type="button" onClick={() => void annuleren()} style={{ minHeight: 44, padding: "0 10px", border: "none", background: "none", fontSize: 17, color: T.green }}>Annuleren</button>
          <div style={{ fontSize: 16, fontWeight: 600, textAlign: "center", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titel}</div>
          <button type="button" onClick={() => void opslaan()} disabled={verplicht && !tekst.trim()} style={{ minHeight: 44, padding: "0 10px", border: "none", background: "none", fontSize: 17, fontWeight: 600, color: verplicht && !tekst.trim() ? T.muted : T.green }}>Opslaan</button>
        </div>
        <div style={{ overflowY: "auto", padding: "4px 16px 4px", minHeight: 0 }}>
          {verplicht && <p style={{ margin: "0 2px 8px", fontSize: 14, color: T.subOnBg }}>Geef een reden op. Deze komt in het rapport en in SharePoint.</p>}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
            {chips.map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => voegIn(c)}
                style={{ flexShrink: 0, minHeight: 36, padding: "0 13px", borderRadius: 999, border: "none", background: T.soft, color: T.green, fontSize: 15, whiteSpace: "nowrap" }}>{c}</button>
            ))}
          </div>
          <textarea
            ref={ref}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder={verplicht ? "Reden (verplicht)" : "Typ je notitie"}
            rows={3}
            style={{ width: "100%", resize: "none", border: "none", outline: "none", borderRadius: R.small, background: "#F2F5F1", padding: "12px 14px", fontSize: 17, lineHeight: 1.4, color: T.rowText, overflowY: "auto" }}
          />
          <div style={{ minHeight: 20, fontSize: 13, color: T.subOnBg, padding: "4px 2px 0" }} aria-live="polite">
            {status === "bezig" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><KnopLader />Opslaan</span> : status === "online" ? "Opgeslagen ✓" : status === "beheer" ? "Lokaal bewaard — beheer vergrendeld of verlopen." : status === "wachtrij" ? "Lokaal bewaard — nog niet verstuurd." : status === "fout" ? "Niet bewaard — houd dit venster open en probeer opnieuw" : ""}
          </div>
          {status === "beheer" && <Button variant="ghost" disabled={ontgrendelen} onClick={() => void herstelBeheer()} className="mt-1 gap-2 text-primary">
            {ontgrendelen ? <KnopLader /> : <span className="material-symbols-rounded" aria-hidden="true">lock_open</span>}
            Beheer ontgrendelen
          </Button>}
        </div>
      </div>
    </div>
  );
}

/** Amber notitiekaart, tik = bewerken. */
export function NotitieKaart({ tekst, onClick, donker }: { tekst: string; onClick: () => void; donker?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label="Notitie bewerken"
      style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start", border: "none", borderRadius: 14, padding: "12px 14px", background: donker ? "rgba(252,201,52,0.14)" : "#FFF6DB", boxShadow: `inset 3px 0 0 ${donker ? "#FCC934" : "#C99A00"}` }}>
      <span className="material-symbols-rounded" style={{ fontSize: 21, color: donker ? "#FCC934" : "#8A6A00", flexShrink: 0 }}>sticky_note_2</span>
      <span style={{ fontSize: 16, lineHeight: 1.4, color: donker ? "#FFF3C4" : "#3D2E00", whiteSpace: "pre-wrap", overflowWrap: "anywhere", flex: 1 }}>{tekst}</span>
      <span className="material-symbols-rounded" style={{ fontSize: 19, color: donker ? "#FCC934" : "#8A6A00", flexShrink: 0 }}>edit</span>
    </button>
  );
}
