// Kantoor: casepagina met TO-rondes (9a)
import { useEffect, useState } from "react";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { zorgVoorBeheer, BEHEER_NODIG } from "@/lib/require-pin";
import { internetVereist } from "@/lib/internet";
import { Pressable, T } from "@/components/apple/Primitives";
import {
  DOSSIER, PARTIJEN, PARTIJ_STIJL, Partij, isReden, redenLabel, TO_ORDER, TO_STATUS, ToRonde, ToStatus,
  actieWie, dagenSinds, dagenTekst, db, fmtDatum, useCase, useWvSuggesties, vandaag, caseNaam, caseNr, caseSub, indieningen,
} from "@/lib/to-rondes";
import { RedenKiezer } from "@/components/cases/RedenKiezer";
import { VgVelden } from "@/components/cases/VgVelden";
import { UitvoeringLabel } from "@/components/cases/UitvoeringLabel";
import { OnHoldBalk, OnHoldKnop } from "@/components/cases/OnHold";
import { DossierNotitie } from "@/components/cases/DossierNotitie";
import { casePresentatie, indieningTekst } from "@/lib/case-presentatie";
import { dagenZonderHold } from "@/lib/on-hold";
import { dossierLabel } from "@/lib/aandacht";

const SUB = T.bodyOnBg;
const card = { background: T.surface, borderRadius: 16, padding: "20px 22px" } as const;
// Invoer minimaal 16px: voorkomt inzoomen op iOS en blijft leesbaar.
const veld = { border: 0, borderRadius: 10, background: T.soft, padding: "12px 14px", font: "inherit", fontSize: 16, color: T.titleOnBg, outline: "none", width: "100%" } as const;
const kop = { fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: SUB } as const;

function Notitie({ value, placeholder, onSave, rows = 2 }: { value: string | null; placeholder: string; onSave: (v: string) => void; rows?: number }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return <textarea rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? "") && onSave(v)} style={{ ...veld, resize: "vertical" }} />;
}

export default function CaseDetail({ stationId }: { stationId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = stationId ?? params.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: c, isLoading, error } = useCase(id);
  const { data: wvNamen = [] } = useWvSuggesties();
  const [draft, setDraft] = useState({ txt: "", bij: "TerreVolt" as Partij, derde: "", notitie: "" });
  const [bewerk, setBewerk] = useState<{ id: string; txt: string; bij: Partij; derde: string; notitie: string } | null>(null);
  if (isLoading) return <PaginaLader label="Case laden…" />;
  if (!c) return <div role="alert" className="p-6">{error ? "Case laden mislukt" : "Case inmiddels verwijderd"}</div>;

  const { station, rondes, bal } = c;
  const cur: ToRonde | null = c.last;
  const n = Math.max(1, rondes.length);
  const curStatus: ToStatus = cur?.status ?? "open";
  const st = TO_STATUS[curStatus];
  const refresh = () => qc.invalidateQueries({ queryKey: ["cases"] });
  const run = async (p: { select: (columns: string) => PromiseLike<{ error: unknown; data: unknown[] | null }> }) => {
    if (!internetVereist() || !await zorgVoorBeheer()) return false;
    try { const { data, error } = await p.select("id"); if (error || !data?.length) { toast.error(`Opslaan mislukt. ${BEHEER_NODIG}`); return false; } refresh(); return true; }
    catch { toast.error(`Opslaan mislukt. ${BEHEER_NODIG}`); return false; }
  };

  const updRonde = (patch: Partial<ToRonde>) =>
    cur ? run(db.from("to_rondes").update(patch).eq("id", cur.id))
        : run(db.from("to_rondes").insert({ station_id: station.id, nummer: 1, ...patch }));

  const gereed = station.technisch_gereed === true;
  const zetStatus = (k: ToStatus) => {
    if (k !== "open" && curStatus === "open" && !gereed) { toast.error("Eerst technisch gereed: kies Ja voordat de TO ingediend wordt."); return; }
    const t = vandaag();
    const ingediend = !cur || cur.status === "open" ? t : cur.ingediend_op;
    if (k === "open") return updRonde({ status: k, ingediend_op: null, reactie_op: null });
    if (k === "controle") return updRonde({ status: k, ingediend_op: ingediend, ingediend_bij: cur?.ingediend_bij ?? "Van Gelder", reactie_op: null });
    return updRonde({ status: k, ingediend_op: ingediend, ingediend_bij: cur?.ingediend_bij ?? "Van Gelder", reactie_op: cur?.reactie_op ?? t });
  };
  const toggleReden = (k: string) => {
    const r = cur?.redenen ?? [];
    return updRonde({ redenen: r.includes(k) ? r.filter((x) => x !== k) : [...r, k] });
  };
  const toggleOpenReden = (k: string) => {
    const r = cur?.open_redenen ?? [];
    return updRonde({ open_redenen: r.includes(k) ? r.filter((x) => x !== k) : [...r, k] });
  };
  const addActie = async () => {
    if (!draft.txt.trim()) return;
    let rondeId = cur?.id;
    if (!rondeId) {
      if (!internetVereist() || !await zorgVoorBeheer()) return;
      const { data, error } = await db.from("to_rondes").insert({ station_id: station.id, nummer: 1 }).select("id").single();
      if (error || !data) { toast.error(`Opslaan mislukt. ${BEHEER_NODIG}`); return; }
      rondeId = data.id;
    }
    const ok = await run(db.from("to_acties").insert({
      ronde_id: rondeId, station_id: station.id, omschrijving: draft.txt.trim(), bij: draft.bij,
      derde_naam: draft.bij === "Derden" ? draft.derde.trim() || null : null, notitie: draft.notitie.trim() || null,
    }));
    if (ok) setDraft((d) => ({ ...d, txt: "", notitie: "" }));
  };
  const bewaarActie = async () => {
    if (!bewerk || !bewerk.txt.trim()) return;
    const ok = await run(db.from("to_acties").update({ omschrijving: bewerk.txt.trim(), bij: bewerk.bij, derde_naam: bewerk.bij === "Derden" ? bewerk.derde.trim() || null : null, notitie: bewerk.notitie.trim() || null }).eq("id", bewerk.id));
    if (ok) setBewerk(null);
  };
  const verwijderActie = async (aid: string) => {
    if (!window.confirm("Dit actiepunt verwijderen?")) return;
    if (await run(db.from("to_acties").delete().eq("id", aid))) setBewerk(null);
  };
  const toggleActie = (aid: string, af: string | null) => run(db.from("to_acties").update({ afgehandeld_op: af ? null : vandaag() }).eq("id", aid));
  const herindienen = () => run(db.from("to_rondes").insert({ station_id: station.id, nummer: rondes.length + 1, status: "controle", ingediend_op: vandaag(), ingediend_bij: "Van Gelder" }));
  const updStation = (patch: Record<string, any>) => run(db.from("stations").update(patch).eq("id", station.id));

  const first = rondes[0];
  const apprIdx = rondes.findIndex((r) => r.status === "goedgekeurd");
  const ftr = first?.status === "goedgekeurd" ? "Ja" : first?.status === "afgekeurd" ? "Nee" : "—";
  const acties = cur?.to_acties ?? [];
  const openN = acties.filter((a) => !a.afgehandeld_op).length;
  const presentatie = casePresentatie(c);
  const balWie = presentatie.partijen;
  // Onderliggende actiehouders die afwijken van de casepartij (bijv. Van Gelder-case met actie bij TerreVolt).
  const afwijkend = [...new Set(presentatie.bal.filter((b) => !balWie.includes(b.wie)).map((b) => b.label))];
  const facts = [
    { k: "Aantal keer ingediend", v: String(indieningen(rondes)), fg: T.titleOnBg },
    { k: "First time right", v: ftr, fg: ftr === "Ja" ? T.green : ftr === "Nee" ? T.danger : SUB },
    { k: "Eerste indiening", v: fmtDatum(first?.ingediend_op), fg: T.titleOnBg },
    { k: "Doorlooptijd", v: first?.ingediend_op ? dagenTekst(dagenZonderHold(first.ingediend_op, apprIdx >= 0 ? rondes[apprIdx].reactie_op : null, station)) : "—", fg: T.titleOnBg },
    { k: "Afkeurredenen totaal", v: String(rondes.reduce((t, r) => t + r.redenen.length, 0)), fg: T.titleOnBg },
  ];
  const dateLine = indieningTekst(cur) ??
    `Ingediend ${fmtDatum(cur.ingediend_op)} bij ${cur.ingediend_bij ?? "Van Gelder"}` +
      (cur.reactie_op ? ` · reactie ${fmtDatum(cur.reactie_op)} (${dagenTekst(dagenSinds(cur.ingediend_op, cur.reactie_op))})` : ` · ${dagenTekst(dagenZonderHold(cur.ingediend_op, null, station))} in behandeling`);
  const vg = station.uitvoerder === "van_gelder";
  const actieBlok = () => (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><div style={kop}>{curStatus === "afgekeurd" ? "Actiepunten uit deze afkeur" : "Actiepunten (bij wie ligt de actie)"}</div><div style={{ fontSize: 13, color: SUB }}>{openN} open</div></div>
                    {acties.map((a) => {
                      const done = !!a.afgehandeld_op, ps = PARTIJ_STIJL[a.bij];
                      if (bewerk?.id === a.id) return (
                        <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, background: T.soft, boxShadow: `inset 0 0 0 1.5px ${T.green}` }}>
                          <input autoFocus value={bewerk.txt} onChange={(e) => setBewerk({ ...bewerk, txt: e.target.value })} aria-label="Omschrijving" style={{ ...veld, background: T.surface, minHeight: 44 }} />
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, marginRight: 4 }}>Bij wie</span>
                            {PARTIJEN.map((p) => <Pressable key={p} onClick={() => setBewerk({ ...bewerk, bij: p })} scale={0.97} style={chip(bewerk.bij === p)}><span className="material-symbols-rounded" style={{ fontSize: 17 }}>{PARTIJ_STIJL[p].icon}</span>{p}</Pressable>)}
                          </div>
                          {bewerk.bij === "Derden" && <input value={bewerk.derde} onChange={(e) => setBewerk({ ...bewerk, derde: e.target.value })} placeholder="Welke derde?" style={{ ...veld, background: T.surface, minHeight: 44 }} />}
                          <input value={bewerk.notitie} onChange={(e) => setBewerk({ ...bewerk, notitie: e.target.value })} placeholder="Notitie (optioneel)" style={{ ...veld, background: T.surface, minHeight: 44 }} />
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Pressable onClick={bewaarActie} disabled={!bewerk.txt.trim()} scale={0.97} style={{ minHeight: 44, padding: "0 18px", borderRadius: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, background: T.green, color: T.surface }}><span className="material-symbols-rounded" style={{ fontSize: 20 }}>check</span>Opslaan</Pressable>
                            <Pressable onClick={() => setBewerk(null)} scale={0.97} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, fontSize: 15, fontWeight: 600, background: T.surface, color: T.titleOnBg }}>Annuleren</Pressable>
                            <Pressable onClick={() => verwijderActie(a.id)} scale={0.97} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, background: T.dangerBg, color: T.danger, marginLeft: "auto" }}><span className="material-symbols-rounded" style={{ fontSize: 20 }}>delete</span>Verwijderen</Pressable>
                          </div>
                        </div>
                      );
                      return (
                        <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 12, background: done ? "#F7FAF6" : T.soft }}>
                          <Pressable role="checkbox" aria-checked={done} aria-label={`${a.omschrijving}: ${done ? "afgehandeld, heropenen" : "afhandelen"}`} onClick={() => toggleActie(a.id, a.afgehandeld_op)} style={{ width: 44, height: 44, margin: "-10px -6px -10px -10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
                            <span style={{ width: 24, height: 24, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: done ? T.green : T.surface, boxShadow: `inset 0 0 0 1.5px ${T.green}`, color: T.surface }}>
                              {done && <span className="material-symbols-rounded" style={{ fontSize: 18 }}>check</span>}
                            </span>
                          </Pressable>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ overflowWrap: "anywhere", fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: done ? T.subOnBg : T.titleOnBg, textDecoration: done ? "line-through" : "none" }}>{a.omschrijving}</div>
                            {a.notitie && <div style={{ fontSize: 13, color: SUB, lineHeight: 1.4, marginTop: 4 }}>{a.notitie}</div>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, maxWidth: "45%", overflowWrap: "anywhere" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: ps.bg, color: ps.fg }}><span className="material-symbols-rounded" style={{ fontSize: 15 }}>{ps.icon}</span>{actieWie(a)}</span>
                            <Pressable onClick={() => setBewerk({ id: a.id, txt: a.omschrijving, bij: a.bij as Partij, derde: a.derde_naam ?? "", notitie: a.notitie ?? "" })} aria-label={`${a.omschrijving} wijzigen`} scale={0.97} style={{ minHeight: 44, padding: "0 10px", margin: "-6px -8px", borderRadius: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, background: "transparent", color: T.green }}><span className="material-symbols-rounded" style={{ fontSize: 18 }}>edit</span>Wijzigen</Pressable>
                            <span style={{ fontSize: 13, color: SUB }}>{done ? `Afgehandeld ${fmtDatum(a.afgehandeld_op)}` : `${dagenTekst(dagenSinds(cur?.reactie_op ?? a.created_at))} open`}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, boxShadow: "inset 0 0 0 1.5px #E1E8E0" }}>
                      <input value={draft.txt} onChange={(e) => setDraft({ ...draft, txt: e.target.value })} placeholder={vg ? "Nieuw actiepunt, bijv. meetrapport aanleveren" : "Nieuw actiepunt, bijv. aarding opnieuw fotograferen"} style={{ ...veld, minHeight: 44 }} />
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, marginRight: 4 }}>Bij wie</span>
                        {PARTIJEN.map((p) => (
                          <Pressable key={p} onClick={() => setDraft({ ...draft, bij: p })} scale={0.97} style={chip(draft.bij === p)}><span className="material-symbols-rounded" style={{ fontSize: 17 }}>{PARTIJ_STIJL[p].icon}</span>{p}</Pressable>
                        ))}
                      </div>
                      {draft.bij === "Derden" && <input value={draft.derde} onChange={(e) => setDraft({ ...draft, derde: e.target.value })} placeholder="Welke derde? Bijv. Hoogendoorn Kabel" style={{ ...veld, minHeight: 44 }} />}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <input value={draft.notitie} onChange={(e) => setDraft({ ...draft, notitie: e.target.value })} placeholder="Notitie (optioneel)" style={{ ...veld, flex: 1, minWidth: 200, minHeight: 44, width: "auto" }} />
                        <Pressable onClick={addActie} disabled={!draft.txt.trim()} scale={0.97} style={{ minHeight: 44, padding: "0 18px", borderRadius: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, background: draft.txt.trim() ? T.green : T.done, color: T.surface }}>
                          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>add</span>Toevoegen
                        </Pressable>
                      </div>
                    </div>
                  </div>
  );
  const placeholder = { open: vg ? "Bijv. wacht op stukken van Van Gelder" : "Bijv. wacht op laatste foto's", controle: "Bijv. Van Gelder heeft doorgezet naar Liander", afgekeurd: "Toelichting van Van Gelder / Liander", goedgekeurd: "Bijv. goedgekeurd door Liander, kenmerk …" }[curStatus];

  const chip = (on: boolean, onBg = T.titleOnBg) => ({ minHeight: 44, padding: "0 12px", borderRadius: 9, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, background: on ? onBg : T.soft, color: on ? T.surface : T.titleOnBg } as const);

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: T.surface, borderBottom: `1px solid ${T.hairline}`, padding: "calc(6px + env(safe-area-inset-top)) clamp(10px, 4vw, 24px) 6px", display: "flex", alignItems: "center", gap: "8px 14px", flexWrap: "wrap" }}>
        <Pressable onClick={() => navigate("/cases")} style={{ display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 15, fontWeight: 600, minHeight: 44 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 22 }}>arrow_back</span><span className="max-sm:hidden">Wie moet wat doen</span><span className="sm:hidden">Cases</span>
        </Pressable>
        <span aria-hidden="true" style={{ color: T.softBorder }}>/</span>
        <span className="font-mono" style={{ fontSize: 15, color: SUB }}>{caseNr(station)}</span>
        {!station.on_hold && <OnHoldKnop key={station.id} id={station.id} />}
      </div>

      <main style={{ padding: "clamp(12px, 4vw, 24px) clamp(12px, 4vw, 24px) 60px", maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {station.on_hold && <OnHoldBalk key={station.id} id={station.id} station={station} />}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="font-mono" style={{ fontSize: 15, fontWeight: 600, color: T.bodyOnBg }}>Case {caseNr(station)}{station.is_nummer ? <span style={{ fontSize: 12, fontWeight: 500, color: SUB, marginLeft: 8 }}>{String(station.is_nummer)}</span> : null}</div>
            <h1 className="font-display" style={{ margin: "4px 0 0", fontWeight: 800, fontSize: 30, overflowWrap: "anywhere", lineHeight: 1.15, color: T.titleOnBg }}>{caseNaam(station)}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <UitvoeringLabel uitvoerder={vg ? "van_gelder" : "terrevolt"} />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: st.bg, color: st.fg }}><span style={{ width: 7, height: 7, borderRadius: 4, background: st.dot }} />TO-status: {st.label}</span>
              <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: station.dossier_status === "afgerond" ? "#E3EFE0" : T.soft, color: station.dossier_status === "afgerond" ? T.green : T.bodyOnBg }}>Dossier: {dossierLabel(station.dossier_status as string | null)}</span>
            </div>
            {vg ? <VgVelden id={station.id} uitvoerder="van_gelder" wv={(station.wv as string | null) ?? null} namen={wvNamen} />
              : <div style={{ fontSize: 14, color: SUB }}>{[caseSub(station), "opdrachtgever Van Gelder", "netbeheerder Liander"].filter(Boolean).join(" · ")}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: SUB }}>Bal bij</span>
            {(balWie.length ? balWie : (["—"] as any[])).map((w) => {
              const p = PARTIJ_STIJL[w as Partij] ?? { bg: T.soft, fg: SUB, icon: "check" };
              return <span key={w} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, fontSize: 15, fontWeight: 700, background: p.bg, color: p.fg }}><span className="material-symbols-rounded" style={{ fontSize: 18 }}>{p.icon}</span>{w === "—" ? "Niemand" : w}</span>;
            })}
            {afwijkend.length > 0 && <span style={{ fontSize: 14, fontWeight: 600, color: T.bodyOnBg }}>· Actie bij: {afwijkend.join(", ")}</span>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {(rondes.length ? rondes : [{ status: "open" } as ToRonde]).map((r, k, arr) => {
            const s = TO_STATUS[r.status];
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: s.bg, color: s.fg, boxShadow: r.status === "open" ? `inset 0 0 0 1px ${T.softBorder}` : "none" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: s.dot }} />Ronde {k + 1} · {s.label}</span>
                {k < arr.length - 1 && <span className="material-symbols-rounded" style={{ fontSize: 18, color: T.done }}>arrow_forward</span>}
              </div>
            );
          })}
        </div>

        {/* Mobiel: huidige ronde en actueel dossier vóór de ingeklapte rondehistorie (wrappers worden 'contents'). */}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3.5 max-lg:contents">
            <div className="order-1 min-w-0 lg:order-none" style={{ ...card, display: "flex", flexDirection: "column", gap: 16, boxShadow: `inset 0 0 0 2px ${st.dot}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: 20 }}>Ronde {n} <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: SUB }}>· huidige ronde</span></div>
                <div style={{ fontSize: 14, color: SUB }}>{dateLine}</div>
              </div>
              {curStatus === "open" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 12, background: gereed ? "#E3EFE0" : "#FFF6E5" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Technisch gereed?</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {([true, false] as const).map((v) => {
                      const on = station.technisch_gereed === v;
                      return <Pressable key={String(v)} onClick={() => updStation({ technisch_gereed: v })} scale={0.97} aria-pressed={on} style={{ minHeight: 46, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 15, fontWeight: 600, background: on ? (v ? T.green : T.danger) : T.surface, color: on ? T.surface : T.titleOnBg }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{v ? "check" : "close"}</span>{v ? "Ja" : "Nee"}
                      </Pressable>;
                    })}
                  </div>
                  {!gereed && <div style={{ fontSize: 13, color: T.bodyOnBg }}>{station.technisch_gereed === false ? "Nog niet technisch gereed. Indienen kan pas als dit Ja is." : "Nog niet beantwoord. Indienen kan pas als dit Ja is."}</div>}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6, opacity: 1 }}>
                {TO_ORDER.map((k) => {
                  const s = TO_STATUS[k], on = curStatus === k;
                  return (
                    <Pressable key={k} onClick={() => zetStatus(k)} scale={0.97} style={{ minHeight: 46, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 600, background: on ? s.bg : "#F7FAF6", color: on ? s.fg : T.titleOnBg, boxShadow: on ? `inset 0 0 0 2px ${s.dot}` : "none" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 5, background: s.dot }} />{s.label}
                    </Pressable>
                  );
                })}
              </div>
              {curStatus !== "open" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 14 }}>
                  <span style={{ fontWeight: 600, marginRight: 4 }}>Ligt ter controle bij</span>
                  {(["Van Gelder", "Liander"] as const).map((p) => {
                    const on = (cur?.ingediend_bij ?? "Van Gelder") === p, ps = PARTIJ_STIJL[p];
                    return <Pressable key={p} onClick={() => updRonde({ ingediend_bij: p })} scale={0.97} style={{ ...chip(false), background: on ? ps.bg : "#F7FAF6", color: on ? ps.fg : T.titleOnBg }}><span className="material-symbols-rounded" style={{ fontSize: 18 }}>{ps.icon}</span>{p}</Pressable>;
                  })}
                </div>
              )}
              {curStatus !== "afgekeurd" && cur && cur.redenen.some((k) => !isReden(k)) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Wat moet er gebeuren</div>
                  {cur.redenen.filter((k) => !isReden(k)).map((k) => <div key={k} style={{ fontSize: 14, color: T.bodyOnBg }}>• {k}</div>)}
                </div>
              )}
              {curStatus === "open" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Waarom blijft de TO open?</div>
                  <RedenKiezer soort="open" gekozen={cur?.open_redenen ?? []} onToggle={toggleOpenReden} kleur={{ aan: T.green, uit: T.soft }} />
                </div>
              )}
              {curStatus === "open" && actieBlok()}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Notitie bij {st.label}</div>
                <Notitie value={cur?.notitie ?? null} placeholder={placeholder} onSave={(v) => updRonde({ notitie: v || null })} />
              </div>

              {curStatus === "afgekeurd" && cur && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: "1px solid #EEF2ED", paddingTop: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ ...kop, color: T.danger }}>Afkeurredenen</div>
                    {cur.redenen.filter((k) => !isReden(k)).map((k) => <div key={k} style={{ fontSize: 14, color: T.danger }}>• {k}</div>)}
                    <RedenKiezer soort="afgekeurd" gekozen={cur.redenen} onToggle={toggleReden} kleur={{ aan: T.danger, uit: T.dangerBg }} />
                  </div>
                  {actieBlok()}
                  <Pressable onClick={herindienen} scale={0.98} style={{ minHeight: 52, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 700, background: openN ? T.soft : T.green, color: openN ? SUB : T.surface, flexWrap: "wrap" }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 22 }}>send</span>Opnieuw indienen als ronde {rondes.length + 1}
                    {openN > 0 && <span style={{ fontWeight: 500, fontSize: 14 }}>· nog {openN} actiepunt{openN > 1 ? "en" : ""} open</span>}
                  </Pressable>
                </div>
              )}
            </div>

            {rondes.length > 1 && (
            <details className="order-3 min-w-0 lg:order-none" style={{ ...card, padding: 0, background: "rgba(255,255,255,0.7)" }}>
              <summary className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1F5C3A] rounded-2xl" style={{ minHeight: 48, padding: "0 22px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 15, fontWeight: 700, color: T.titleOnBg }}>
                <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 20 }}>history</span>Eerdere rondes ({rondes.length - 1})
                <span style={{ fontWeight: 500, fontSize: 13, color: SUB }}>{rondes.slice(0, -1).map((r) => `${r.nummer}: ${TO_STATUS[r.status].label}`).join(" · ")}</span>
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 10px 10px" }}>
            {rondes.slice(0, -1).reverse().map((r) => {
              const s = TO_STATUS[r.status];
              return (
                <div key={r.id} style={{ ...card, padding: "16px 22px", background: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>Ronde {r.nummer}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: s.bg, color: s.fg }}><span style={{ width: 7, height: 7, borderRadius: 4, background: s.dot }} />{s.label}</span>
                    </div>
                    <span style={{ fontSize: 13, color: SUB }}>{indieningTekst(r) ?? `Ingediend ${fmtDatum(r.ingediend_op)} bij ${r.ingediend_bij ?? "—"}`}{r.reactie_op ? ` · reactie ${fmtDatum(r.reactie_op)}` : ""}</span>
                  </div>
                  {r.redenen.length > 0 && <div style={{ fontSize: 14, fontWeight: 600, color: T.danger }}>{r.redenen.map(redenLabel).join(" · ")}</div>}
                  {r.notitie && <div style={{ fontSize: 14, color: SUB, lineHeight: 1.4 }}>{r.notitie}</div>}
                  {r.to_acties.length > 0 && (
                    <div style={{ fontSize: 13, color: SUB }}>
                      {r.to_acties.length} actiepunt{r.to_acties.length > 1 ? "en" : ""}: {r.to_acties.map((a) => `${a.omschrijving} (${actieWie(a)}, ${a.afgehandeld_op ? fmtDatum(a.afgehandeld_op) : "open"})`).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
              </div>
            </details>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4 max-lg:contents">
            <div className="order-4 min-w-0 lg:order-none" style={card}>
              <div className="font-display" style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>TO-samenvatting</div>
              {facts.map((f) => (
                <div key={f.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid #F0F3EF", fontSize: 14 }}>
                  <span style={{ color: SUB }}>{f.k}</span><span style={{ fontWeight: 700, color: f.fg }}>{f.v}</span>
                </div>
              ))}
            </div>
            <div className="order-2 min-w-0 lg:order-none" style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: 17 }}>Opleverdossier <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: SUB }}>· {dossierLabel(station.dossier_status as string | null)}</span></div>
                <div style={{ fontSize: 13, color: SUB }}>bij Van Gelder</div>
              </div>
              {DOSSIER.map((d) => {
                const on = (station.dossier_status ?? "ingediend") === d.key;
                return (
                  <Pressable key={d.key} onClick={() => updStation({ dossier_status: d.key })} scale={0.98} style={{ minHeight: 48, padding: "0 12px", borderRadius: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, background: on ? "#E3EFE0" : "#F7FAF6", color: on ? T.green : T.titleOnBg, boxShadow: on ? `inset 0 0 0 2px ${T.green}` : "none", width: "100%", textAlign: "left" }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 19 }}>{d.icon}</span><span style={{ flex: 1 }}>{d.label}</span>
                    {on && <span className="material-symbols-rounded" style={{ fontSize: 18 }}>check</span>}
                  </Pressable>
                );
              })}
              <DossierNotitie key={station.id} id={station.id} tekst={station.dossier_notitie as string | null} versie={Number(station.dossier_notitie_versie ?? 0)} refresh={refresh} />
              {station.hold_periodes?.map((h: any) => <div key={h.id} className="text-sm break-words" style={{ color: SUB }}>On hold {h.begin_op ?? "begin onbekend"} — {h.einde_op ?? "lopend"} · {h.reden} · {h.partij}</div>)}
            </div>
            <div className="order-5 min-w-0 lg:order-none" style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="font-display" style={{ fontWeight: 700, fontSize: 17 }}>
                {station.case_verborgen ? "Terugzetten in cases" : "Uit cases-overzicht halen"}
              </div>
              <div style={{ fontSize: 14, color: SUB }}>
                {vg ? "De case blijft bestaan. Alleen verborgen in Cases & TO." : <>Het station en de foto's blijven bestaan. Alleen verborgen in Cases &amp; TO.</>}
              </div>
              <Pressable
                onClick={async () => {
                  if (station.case_verborgen) {
                    await run(db.from("stations").update({ case_verborgen: false }).eq("id", station.id));
                    qc.invalidateQueries({ queryKey: ["cases"] });
                  } else if (window.confirm("Deze case verbergen uit het overzicht?")) {
                    await run(db.from("stations").update({ case_verborgen: true }).eq("id", station.id));
                    qc.invalidateQueries({ queryKey: ["cases"] });
                    navigate("/cases");
                  }
                }}
                scale={0.98}
                style={{
                  minHeight: 46, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 8, fontSize: 15, fontWeight: 600, width: "100%",
                  background: station.case_verborgen ? T.soft : T.dangerBg,
                  color: station.case_verborgen ? T.green : T.danger,
                }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{station.case_verborgen ? "visibility" : "visibility_off"}</span>
                {station.case_verborgen ? "Terugzetten in cases" : "Verbergen uit cases"}
              </Pressable>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
