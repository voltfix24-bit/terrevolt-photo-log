// Kantoor: casepagina met TO-rondes (9a)
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pressable, T } from "@/components/apple/Primitives";
import {
  DOSSIER, PARTIJEN, PARTIJ_STIJL, Partij, REDENEN, REDEN_LABEL, TO_ORDER, TO_STATUS, ToRonde, ToStatus,
  actieWie, dagenSinds, dagenTekst, db, fmtDatum, useCases, vandaag, caseNaam, caseNr, caseSub,
} from "@/lib/to-rondes";

const SUB = T.bodyOnBg;
const card = { background: T.surface, borderRadius: 16, padding: "20px 22px" } as const;
const veld = { border: 0, borderRadius: 10, background: T.soft, padding: "12px 14px", font: "inherit", fontSize: 14, color: T.titleOnBg, outline: "none", width: "100%" } as const;
const kop = { fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: SUB } as const;

function Notitie({ value, placeholder, onSave, rows = 2 }: { value: string | null; placeholder: string; onSave: (v: string) => void; rows?: number }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return <textarea rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? "") && onSave(v)} style={{ ...veld, resize: "vertical" }} />;
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: cases } = useCases();
  const [draft, setDraft] = useState({ txt: "", bij: "TerreVolt" as Partij, derde: "", notitie: "" });
  const c = cases?.find((x) => x.station.id === id);
  if (!c) return <div style={{ minHeight: "100vh", background: T.bg }} />;

  const { station, rondes, bal } = c;
  const cur: ToRonde | null = c.last;
  const n = Math.max(1, rondes.length);
  const curStatus: ToStatus = cur?.status ?? "open";
  const st = TO_STATUS[curStatus];
  const refresh = () => qc.invalidateQueries({ queryKey: ["cases"] });
  const run = async (p: Promise<{ error: any }>) => { const { error } = await p; if (error) toast.error("Opslaan mislukt"); refresh(); };

  const updRonde = (patch: Partial<ToRonde>) =>
    cur ? run(db.from("to_rondes").update(patch).eq("id", cur.id))
        : run(db.from("to_rondes").insert({ station_id: station.id, nummer: 1, ...patch }));

  const zetStatus = (k: ToStatus) => {
    const t = vandaag();
    if (k === "open") return updRonde({ status: k, ingediend_op: null, reactie_op: null });
    if (k === "controle") return updRonde({ status: k, ingediend_op: cur?.ingediend_op ?? t, ingediend_bij: cur?.ingediend_bij ?? "Van Gelder", reactie_op: null });
    return updRonde({ status: k, ingediend_op: cur?.ingediend_op ?? t, ingediend_bij: cur?.ingediend_bij ?? "Van Gelder", reactie_op: cur?.reactie_op ?? t });
  };
  const toggleReden = (k: string) => {
    const r = cur?.redenen ?? [];
    updRonde({ redenen: r.includes(k) ? r.filter((x) => x !== k) : [...r, k] });
  };
  const addActie = async () => {
    if (!draft.txt.trim() || !cur) return;
    await run(db.from("to_acties").insert({
      ronde_id: cur.id, station_id: station.id, omschrijving: draft.txt.trim(), bij: draft.bij,
      derde_naam: draft.bij === "Derden" ? draft.derde.trim() || null : null, notitie: draft.notitie.trim() || null,
    }));
    setDraft((d) => ({ ...d, txt: "", notitie: "" }));
  };
  const toggleActie = (aid: string, af: string | null) => run(db.from("to_acties").update({ afgehandeld_op: af ? null : vandaag() }).eq("id", aid));
  const herindienen = () => run(db.from("to_rondes").insert({ station_id: station.id, nummer: rondes.length + 1, status: "controle", ingediend_op: vandaag(), ingediend_bij: "Van Gelder" }));
  const updStation = (patch: Record<string, any>) => run(db.from("stations").update(patch).eq("id", station.id));

  const first = rondes[0];
  const apprIdx = rondes.findIndex((r) => r.status === "goedgekeurd");
  const ftr = first?.status === "goedgekeurd" ? "Ja" : first?.status === "afgekeurd" ? "Nee" : "—";
  const acties = cur?.to_acties ?? [];
  const openN = acties.filter((a) => !a.afgehandeld_op).length;
  const balWie = bal.length ? [...new Set(bal.map((b) => b.wie))] : [];
  const facts = [
    { k: "Aantal keer ingediend", v: String(rondes.filter((r) => r.ingediend_op).length), fg: T.titleOnBg },
    { k: "First time right", v: ftr, fg: ftr === "Ja" ? T.green : ftr === "Nee" ? T.danger : SUB },
    { k: "Eerste indiening", v: fmtDatum(first?.ingediend_op), fg: T.titleOnBg },
    { k: "Doorlooptijd", v: first?.ingediend_op ? dagenTekst(dagenSinds(first.ingediend_op, apprIdx >= 0 ? rondes[apprIdx].reactie_op : null)) : "—", fg: T.titleOnBg },
    { k: "Afkeurredenen totaal", v: String(rondes.reduce((t, r) => t + r.redenen.length, 0)), fg: T.titleOnBg },
  ];
  const dateLine = !cur?.ingediend_op ? "Nog niet ingediend"
    : `Ingediend ${fmtDatum(cur.ingediend_op)} bij ${cur.ingediend_bij ?? "Van Gelder"}` +
      (cur.reactie_op ? ` · reactie ${fmtDatum(cur.reactie_op)} (${dagenTekst(dagenSinds(cur.ingediend_op, cur.reactie_op))})` : ` · ${dagenTekst(dagenSinds(cur.ingediend_op))} in behandeling`);
  const placeholder = { open: "Bijv. wacht op laatste foto's", controle: "Bijv. Van Gelder heeft doorgezet naar Liander", afgekeurd: "Toelichting van Van Gelder / Liander", goedgekeurd: "Bijv. goedgekeurd door Liander, kenmerk …" }[curStatus];

  const chip = (on: boolean, onBg = T.titleOnBg) => ({ minHeight: 38, padding: "0 12px", borderRadius: 9, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, background: on ? onBg : T.soft, color: on ? T.surface : T.titleOnBg } as const);

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: T.surface, borderBottom: `1px solid ${T.hairline}`, padding: "calc(12px + env(safe-area-inset-top)) 24px 12px", display: "flex", alignItems: "center", gap: 14 }}>
        <Pressable onClick={() => navigate("/cases")} style={{ display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 15, fontWeight: 600, minHeight: 44 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 22 }}>arrow_back</span>Wie moet wat doen
        </Pressable>
        <span style={{ color: T.softBorder }}>/</span>
        <span className="font-mono" style={{ fontSize: 15, color: SUB }}>{caseNr(station)}</span>
      </div>

      <main style={{ padding: "24px 24px 60px", maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="font-mono" style={{ fontSize: 15, fontWeight: 600, color: T.bodyOnBg }}>Case {caseNr(station)}</div>
            <h1 className="font-display" style={{ margin: "4px 0 0", fontWeight: 800, fontSize: 30, lineHeight: 1.15, color: T.titleOnBg }}>{caseNaam(station)}</h1>
            <div style={{ fontSize: 14, color: SUB }}>{[caseSub(station), "opdrachtgever Van Gelder", "netbeheerder Liander"].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: SUB }}>Bal ligt bij</span>
            {(balWie.length ? balWie : (["—"] as any[])).map((w) => {
              const p = PARTIJ_STIJL[w as Partij] ?? { bg: T.soft, fg: SUB, icon: "check" };
              return <span key={w} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, fontSize: 15, fontWeight: 700, background: p.bg, color: p.fg }}><span className="material-symbols-rounded" style={{ fontSize: 18 }}>{p.icon}</span>{w === "—" ? "Niemand" : w}</span>;
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {(rondes.length ? rondes : [{ status: "open" } as ToRonde]).map((r, k, arr) => {
            const s = TO_STATUS[r.status];
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: s.bg, color: s.fg }}><span style={{ width: 8, height: 8, borderRadius: 4, background: s.dot }} />Ronde {k + 1} · {s.label}</span>
                {k < arr.length - 1 && <span className="material-symbols-rounded" style={{ fontSize: 18, color: T.done }}>arrow_forward</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, gridColumn: "span 2" }}>
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16, boxShadow: `inset 0 0 0 2px ${st.dot}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: 20 }}>Ronde {n} <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: SUB }}>· huidige ronde</span></div>
                <div style={{ fontSize: 14, color: SUB }}>{dateLine}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Notitie bij {st.label}</div>
                <Notitie value={cur?.notitie ?? null} placeholder={placeholder} onSave={(v) => updRonde({ notitie: v || null })} />
              </div>

              {curStatus === "afgekeurd" && cur && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: "1px solid #EEF2ED", paddingTop: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ ...kop, color: T.danger }}>Afkeurredenen</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {REDENEN.map((r) => {
                        const on = cur.redenen.includes(r.key);
                        return <Pressable key={r.key} onClick={() => toggleReden(r.key)} scale={0.97} style={{ ...chip(false), background: on ? T.danger : T.dangerBg, color: on ? T.surface : T.danger }}><span className="material-symbols-rounded" style={{ fontSize: 17 }}>{on ? "check" : "add"}</span>{r.label}</Pressable>;
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><div style={kop}>Actiepunten uit deze afkeur</div><div style={{ fontSize: 13, color: SUB }}>{openN} open</div></div>
                    {acties.map((a) => {
                      const done = !!a.afgehandeld_op, ps = PARTIJ_STIJL[a.bij];
                      return (
                        <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 12, background: done ? "#F7FAF6" : T.soft }}>
                          <Pressable aria-label={done ? "Heropenen" : "Afhandelen"} onClick={() => toggleActie(a.id, a.afgehandeld_op)} style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? T.green : T.surface, boxShadow: `inset 0 0 0 1.5px ${T.green}`, color: T.surface }}>
                            {done && <span className="material-symbols-rounded" style={{ fontSize: 18 }}>check</span>}
                          </Pressable>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: done ? T.subOnBg : T.titleOnBg, textDecoration: done ? "line-through" : "none" }}>{a.omschrijving}</div>
                            {a.notitie && <div style={{ fontSize: 13, color: SUB, lineHeight: 1.4, marginTop: 4 }}>{a.notitie}</div>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: ps.bg, color: ps.fg }}><span className="material-symbols-rounded" style={{ fontSize: 15 }}>{ps.icon}</span>{actieWie(a)}</span>
                            <span style={{ fontSize: 13, color: SUB }}>{done ? `Afgehandeld ${fmtDatum(a.afgehandeld_op)}` : `${dagenTekst(dagenSinds(cur.reactie_op ?? a.created_at))} open`}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, boxShadow: "inset 0 0 0 1.5px #E1E8E0" }}>
                      <input value={draft.txt} onChange={(e) => setDraft({ ...draft, txt: e.target.value })} placeholder="Nieuw actiepunt, bijv. aarding opnieuw fotograferen" style={{ ...veld, fontSize: 15, minHeight: 44 }} />
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
                  <Pressable onClick={herindienen} scale={0.98} style={{ minHeight: 52, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16, fontWeight: 700, background: openN ? T.soft : T.green, color: openN ? SUB : T.surface, flexWrap: "wrap" }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 22 }}>send</span>Opnieuw indienen als ronde {rondes.length + 1}
                    {openN > 0 && <span style={{ fontWeight: 500, fontSize: 14 }}>· nog {openN} actiepunt{openN > 1 ? "en" : ""} open</span>}
                  </Pressable>
                </div>
              )}
            </div>

            {rondes.slice(0, -1).reverse().map((r) => {
              const s = TO_STATUS[r.status];
              return (
                <div key={r.id} style={{ ...card, padding: "16px 22px", background: "rgba(255,255,255,0.7)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>Ronde {r.nummer}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: s.bg, color: s.fg }}><span style={{ width: 7, height: 7, borderRadius: 4, background: s.dot }} />{s.label}</span>
                    </div>
                    <span style={{ fontSize: 13, color: SUB }}>Ingediend {fmtDatum(r.ingediend_op)} bij {r.ingediend_bij ?? "—"}{r.reactie_op ? ` · reactie ${fmtDatum(r.reactie_op)}` : ""}</span>
                  </div>
                  {r.redenen.length > 0 && <div style={{ fontSize: 14, fontWeight: 600, color: T.danger }}>{r.redenen.map((k) => REDEN_LABEL[k] ?? k).join(" · ")}</div>}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={card}>
              <div className="font-display" style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>TO-samenvatting</div>
              {facts.map((f) => (
                <div key={f.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid #F0F3EF", fontSize: 14 }}>
                  <span style={{ color: SUB }}>{f.k}</span><span style={{ fontWeight: 700, color: f.fg }}>{f.v}</span>
                </div>
              ))}
            </div>
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="font-display" style={{ fontWeight: 700, fontSize: 17 }}>Opleverdossier</div>
                <div style={{ fontSize: 13, color: SUB }}>bij Van Gelder</div>
              </div>
              {DOSSIER.map((d) => {
                const on = (station.dossier_status ?? "ingediend") === d.key;
                return (
                  <Pressable key={d.key} onClick={() => updStation({ dossier_status: d.key })} scale={0.98} style={{ minHeight: 42, padding: "0 12px", borderRadius: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, background: on ? "#E3EFE0" : "#F7FAF6", color: on ? T.green : T.titleOnBg, boxShadow: on ? `inset 0 0 0 2px ${T.green}` : "none", width: "100%", textAlign: "left" }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 19 }}>{d.icon}</span><span style={{ flex: 1 }}>{d.label}</span>
                    {on && <span className="material-symbols-rounded" style={{ fontSize: 18 }}>check</span>}
                  </Pressable>
                );
              })}
              <Notitie value={station.dossier_notitie} placeholder="Notitie, bijv. navraag gedaan bij Van Gelder op 12 nov" onSave={(v) => updStation({ dossier_notitie: v || null })} />
            </div>
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="font-display" style={{ fontWeight: 700, fontSize: 17 }}>
                {station.case_verborgen ? "Terugzetten in cases" : "Uit cases-overzicht halen"}
              </div>
              <div style={{ fontSize: 14, color: SUB }}>
                Het station en de foto's blijven bestaan. Alleen verborgen in Cases &amp; TO.
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
