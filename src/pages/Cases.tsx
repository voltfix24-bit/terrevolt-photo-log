// Kantoor: "Wie moet wat doen" (9b) + "TO-score" (9c)
import { useState } from "react";
import { FileUp, MoreHorizontal, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UitvoeringLabel } from "@/components/cases/UitvoeringLabel";
import { aandachtItems, aantalActies, dossierLabel, SOORT_TITEL, type AandachtItem } from "@/lib/aandacht";
import { bordItems, partijTellingen, type Lane } from "@/lib/bord-groepen";
import { useIsMobile } from "@/hooks/use-mobile";
import { CaseToevoegenDialog } from "@/components/cases/CaseToevoegenDialog";
import { Bord } from "@/components/cases/Bord";
import { OnHoldLabel } from "@/components/cases/OnHoldLabel";
import { ImportScherm, ImportFoutGrens } from "@/components/cases/ImportScherm";
import { internetVereist } from "@/lib/internet";
import { casePresentatie } from "@/lib/case-presentatie";
import { FILTER_OPTIES, bewaarFilter, filterCases, leesFilter, tellingen, uitvoerderVan, type UitvoerderFilter } from "@/lib/cases-filter";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { casesUrl, type UrlStation } from "@/lib/urls";
import { zoekCases } from "@/lib/cases-zoeken";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pressable, R, T } from "@/components/apple/Primitives";
import { CaseItem, PARTIJ_STIJL, Partij, TO_STATUS, caseNaam, caseNr, caseSub, dagenTekst, scoreVan, scorePerUitvoerder, useCases } from "@/lib/to-rondes";

const SUB = T.bodyOnBg;
const card = { background: T.surface, borderRadius: 14 } as const;

function StatusPil({ status, prefix }: { status: keyof typeof TO_STATUS; prefix?: string }) {
  const s = TO_STATUS[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: s.dot }} />{prefix}{s.label}
    </span>
  );
}

const fmt1 = (v: number | null) => (v == null ? "—" : v.toFixed(1).replace(".", ","));
/** Alleen uitvoerders binnen het filter: een uitvoerder buiten het filter is geen echte nulscore. */
function PerUitvoerder({ cases, filter }: { cases: CaseItem[]; filter: UitvoerderFilter }) {
  const lijst = scorePerUitvoerder(cases).filter((u) => filter === "alle" || u.uitvoerder === filter);
  return (
    <div aria-label="TO-score per uitvoerder" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
      {lijst.map((u) => (
        <div key={u.uitvoerder} style={{ ...card, padding: "16px 20px" }}>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 17, color: T.titleOnBg }}>{u.uitvoerder === "van_gelder" ? "Van Gelder" : "TerreVolt"} <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: SUB }}>{u.casesN} cases</span></div>
          <div style={{ display: "flex", gap: 20, marginTop: 8, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 13, color: SUB }}>First time right</div><div className="font-display" style={{ fontWeight: 800, fontSize: 26, color: T.green }}>{u.ftrPct == null ? "—" : `${u.ftrPct}%`}</div><div style={{ fontSize: 12, color: SUB }}>{u.ftrN} van {u.judgedN} beoordeeld</div></div>
            <div><div style={{ fontSize: 13, color: SUB }}>Gem. rondes tot goedkeuring</div><div className="font-display" style={{ fontWeight: 800, fontSize: 26, color: T.titleOnBg }}>{fmt1(u.gemRondes)}</div><div style={{ fontSize: 12, color: SUB }}>{u.goedgekeurdN} goedgekeurd</div></div>
            <div><div style={{ fontSize: 13, color: SUB }}>Gem. indieningen</div><div className="font-display" style={{ fontWeight: 800, fontSize: 26, color: T.titleOnBg }}>{fmt1(u.gemIndieningen)}</div><div style={{ fontSize: 12, color: SUB }}>per ingediende case</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RondeBlokjes({ c }: { c: CaseItem }) {
  const lijst = c.rondes.length ? c.rondes : [{ status: "open" as const }];
  const tekst = lijst.map((r, k) => `Ronde ${k + 1}: ${TO_STATUS[r.status as keyof typeof TO_STATUS].label}`).join(", ");
  return (
    <span role="img" aria-label={tekst} title={tekst} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {lijst.map((r, k) => {
        const st = TO_STATUS[r.status as keyof typeof TO_STATUS];
        const licht = r.status === "open";
        return <span key={k} aria-hidden="true" style={{ minWidth: 20, height: 20, borderRadius: 5, background: st.dot, color: licht ? "#0A2A18" : "#FFFFFF", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{k + 1}</span>;
      })}
    </span>
  );
}

function DossierPil({ status }: { status: string | null | undefined }) {
  const af = status === "afgerond";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: af ? "#E3EFE0" : T.soft, color: af ? T.green : T.bodyOnBg, whiteSpace: "nowrap" }}>Dossier: {dossierLabel(status)}</span>;
}

function Score({ cases, open, filter, mobiel }: { cases: CaseItem[]; open: (s: UrlStation) => void; filter: UitvoerderFilter; mobiel: boolean }) {
  const s = scoreVan(cases);
  const afgekeurd = cases.filter((c) => c.last?.status === "afgekeurd");
  const afgekeurdVG = afgekeurd.filter((c) => uitvoerderVan(c) === "van_gelder").length;
  const max = Math.max(1, ...s.redenen.map((r) => r.n));
  const kpis = [
    { label: "First time right", v: s.ftrPct == null ? "—" : `${s.ftrPct}%`, sub: `${s.ftrN} van ${s.judgedN} beoordeelde cases in één keer goed`, fg: T.green },
    { label: "Gem. rondes tot goedkeuring", v: s.gemRondes == null ? "—" : s.gemRondes.toFixed(1).replace(".", ","), sub: `${s.goedgekeurdN} goedgekeurde cases`, fg: T.titleOnBg },
    { label: "Ter controle", v: String(s.controleN), sub: `${s.controleVG} bij Van Gelder · ${s.controleLiander} bij Liander`, fg: T.upload },
    { label: "Afgekeurd, nog niet herindiend", v: String(s.afgekeurdN), sub: filter === "alle" ? `${s.afgekeurdN - afgekeurdVG} met uitvoering TerreVolt · ${afgekeurdVG} met uitvoering Van Gelder` : "Actiepunten staan bij de partij in ‘Wie moet wat doen’", fg: T.danger },
  ];
  const cols = "110px minmax(200px,1fr) 110px 130px 160px 140px";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PerUitvoerder cases={cases} filter={filter} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ ...card, padding: "18px 20px" }}>
            <div style={{ fontSize: 14, color: SUB, fontWeight: 500 }}>{k.label}</div>
            <div className="font-display" style={{ fontWeight: 800, fontSize: 34, lineHeight: 1.1, color: k.fg, marginTop: 4 }}>{k.v}</div>
            <div style={{ fontSize: 13, color: SUB, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="font-display" style={{ fontWeight: 700, fontSize: 17 }}>Afkeurredenen</div>
          {s.redenen.length === 0 && <div style={{ fontSize: 14, color: SUB }}>Nog geen afkeuringen</div>}
          {s.redenen.map((r) => (
            <div key={r.key}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span style={{ fontWeight: 600 }}>{r.label}</span><span style={{ color: SUB }}>{r.n}×</span></div>
              <div style={{ height: 8, borderRadius: 4, background: "#F0F3EF", marginTop: 5 }}><div style={{ height: 8, borderRadius: 4, background: T.danger, width: `${(r.n / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        {mobiel ? (
          <ul aria-label="Cases" style={{ ...card, listStyle: "none", margin: 0, padding: 0, overflow: "hidden" }}>
            {cases.map((c) => (
              <li key={c.station.id} style={{ borderTop: `1px solid ${T.hairline}` }}>
                <Pressable onClick={() => open(c.station)} scale={0.99} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", width: "100%", textAlign: "left", minHeight: 48 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="font-mono" style={{ fontWeight: 700, fontSize: 14 }}>{caseNr(c.station)}</span>
                    <UitvoeringLabel uitvoerder={uitvoerderVan(c)} variant="kort" />
                    {c.station.on_hold && <OnHoldLabel />}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 15, color: T.titleOnBg, overflowWrap: "anywhere" }}>{caseNaam(c.station)}</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <StatusPil status={c.last?.status ?? "open"} />
                    <DossierPil status={c.station.dossier_status as string | null} />
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: SUB }}>
                    <span style={{ fontWeight: 600 }}>Bal bij: {casePresentatie(c).partijen.join(", ") || "niemand"}</span>
                    <RondeBlokjes c={c} />
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        ) : (
        <div style={{ ...card, overflow: "auto", gridColumn: "auto", minWidth: 0, maxWidth: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "12px 18px", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: SUB, borderBottom: `1px solid ${T.hairline}`, minWidth: 800 }}>
            <span>Case</span><span>Casenaam</span><span>Rondes</span><span>TO-status</span><span>Dossier</span><span>Bal bij</span>
          </div>
          {cases.map((c) => (
            <Pressable key={c.station.id} onClick={() => open(c.station)} scale={0.99} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "11px 18px", alignItems: "center", fontSize: 14, borderBottom: "1px solid #F0F3EF", width: "100%", textAlign: "left", minWidth: 800 }}>
              <span className="font-mono" style={{ fontWeight: 600 }}>{caseNr(c.station)}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseNaam(c.station)}</span>
                  {c.station.on_hold && <OnHoldLabel />}
                </span>
                {caseSub(c.station) && <span style={{ display: "block", fontSize: 12, color: T.subOnBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseSub(c.station)}</span>}
              </span>
              <RondeBlokjes c={c} />
              <span><StatusPil status={c.last?.status ?? "open"} /></span>
              <span><DossierPil status={c.station.dossier_status as string | null} /></span>
              <span style={{ fontWeight: 600, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{casePresentatie(c).partijen.join(", ") || "—"}</span>
            </Pressable>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

const SOORT_KLEUR: Record<AandachtItem["soort"], { bg: string; fg: string }> = {
  hervatten: { bg: "#FDEFE4", fg: "#9A4A06" }, afkeur: { bg: "#FBEDEC", fg: "#B33A3A" }, afronden: { bg: "#E3EFE0", fg: "#1F5C3A" },
};

/** Compacte opvolglijst: alleen bestaande acties met casenummer, volgende actie, verantwoordelijke en datum. */
function Aandacht({ cases, open }: { cases: CaseItem[]; open: (s: UrlStation) => void }) {
  const items = aandachtItems(cases);
  const [alles, setAlles] = useState(false);
  if (!items.length) return null;
  const zicht = alles ? items : items.slice(0, 5);
  const uniek = new Set(items.map((i) => i.c.station.id)).size;
  const nActies = aantalActies(items);
  return (
    <section aria-labelledby="aandacht-kop" style={{ ...card, padding: "14px 16px", marginBottom: 18 }}>
      <h2 id="aandacht-kop" className="font-display" style={{ margin: 0, fontWeight: 700, fontSize: 17, color: T.titleOnBg }}>
        Aandacht <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: SUB }}>{nActies} {nActies === 1 ? "actie" : "acties"} · {uniek} {uniek === 1 ? "case" : "cases"}</span>
      </h2>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
        {zicht.map((i, k) => {
          const kl = SOORT_KLEUR[i.soort];
          return (
            <li key={i.c.station.id + i.soort + k} style={{ borderTop: k ? `1px solid ${T.hairline}` : "none" }}>
              <Pressable onClick={() => open(i.c.station)} scale={0.99} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 4px", width: "100%", textAlign: "left", minHeight: 48 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: kl.bg, color: kl.fg }}>{SOORT_TITEL[i.soort]}</span>
                  <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: T.titleOnBg }}>{i.casenummer}</span>
                  <UitvoeringLabel uitvoerder={uitvoerderVan(i.c)} variant="kort" />
                  <span style={{ fontSize: 13, color: SUB, marginLeft: "auto" }}>{i.datum}</span>
                </span>
                {i.acties && i.acties.length > 1 ? (
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: SUB }}>{i.acties.length} open acties</span>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {i.acties.map((a, j) => (
                        <li key={j} style={{ fontSize: 15, fontWeight: 600, color: T.titleOnBg, overflowWrap: "anywhere" }}>
                          {a.tekst}{a.actieBij ? <span style={{ fontSize: 13, fontWeight: 400, color: SUB }}> · Actie bij: <b>{a.actieBij}</b></span> : null}
                        </li>
                      ))}
                    </ul>
                  </span>
                ) : (
                  <span style={{ fontSize: 15, fontWeight: 600, color: T.titleOnBg, overflowWrap: "anywhere" }}>{i.actie}</span>
                )}
                <span style={{ fontSize: 13, color: SUB }}>Bal bij: <b>{i.balBij}</b>{i.actieBij ? <> · Actie bij: <b>{i.actieBij}</b></> : null} · {caseNaam(i.c.station)}</span>
              </Pressable>
            </li>
          );
        })}
      </ul>
      {items.length > 5 && (
        <button type="button" onClick={() => setAlles((a) => !a)} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1F5C3A] rounded-lg" style={{ minHeight: 44, padding: "0 8px", fontSize: 14, fontWeight: 600, color: T.green, background: "none", border: 0 }}>
          {alles ? "Toon minder" : `Toon alle ${items.length}`}
        </button>
      )}
    </section>
  );
}

const PARTIJ_KEUZES: (Lane | "alle")[] = ["alle", "TerreVolt", "Van Gelder", "Liander", "Derden"];

export default function Cases() {
  const navigate = useNavigate();
  const mobiel = useIsMobile() ?? false;
  const [params, setParams] = useSearchParams();
  const [toonVerborgen, setToonVerborgen] = useState(false);
  const { data: alleCases, isLoading, isError, refetch } = useCases({ inclVerborgen: toonVerborgen });
  const [filter, setFilterState] = useState<UitvoerderFilter>(() => leesFilter());
  const setFilter = (f: UitvoerderFilter) => { setFilterState(f); bewaarFilter(f); };
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPoging, setImportPoging] = useState(0);
  const startImport = () => { if (internetVereist()) { setImportPoging(p => p+1); setImportOpen(true); } };
  const telling = tellingen(alleCases ?? []);
  const zoek = params.get("q") ?? "";
  const zetZoek = (q: string) => setParams((prev) => { const n = new URLSearchParams(prev); if (q) n.set("q", q); else n.delete("q"); return n; }, { replace: true });
  const gefilterd = filterCases(alleCases ?? [], filter);
  const cases = zoekCases(gefilterd, zoek);
  const [tab, setTab] = useState<"bal" | "score">("bal");
  // Partijkeuze staat los van het uitvoerderfilter (URL, niet localStorage). Mobiel standaard één werklijst.
  const partijParam = params.get("partij") as Lane | "alle" | null;
  const partij: Lane | "alle" = partijParam && PARTIJ_KEUZES.includes(partijParam) ? partijParam : mobiel ? "TerreVolt" : "alle";
  const kiesPartij = (p: Lane | "alle") => setParams((prev) => { const n = new URLSearchParams(prev); n.set("partij", p); return n; }, { replace: true });
  const partijTel = partijTellingen(bordItems(cases));
  const open = (s: UrlStation) => navigate(casesUrl(s));
  const knop = { minHeight: 44, padding: "0 14px", borderRadius: 22, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 } as const;
  const tabs = (
    <div role="tablist" aria-label="Weergave" style={{ display: "flex", gap: 4, background: T.soft, padding: 4, borderRadius: 12, width: mobiel ? "100%" : undefined }}>
      {([["bal", "Wie moet wat doen"], ["score", "TO-score"]] as const).map(([k, l]) => (
        <Pressable key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} scale={0.97} style={{ flex: mobiel ? 1 : undefined, minHeight: 44, padding: "0 14px", borderRadius: 9, fontSize: 15, fontWeight: 600, background: tab === k ? T.green : "transparent", color: tab === k ? T.surface : T.titleOnBg }}>{l}</Pressable>
      ))}
    </div>
  );
  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: T.surface, borderBottom: `1px solid ${T.hairline}`, padding: mobiel ? "calc(4px + env(safe-area-inset-top)) 8px 4px" : "calc(12px + env(safe-area-inset-top)) 24px 12px", display: "flex", alignItems: "center", gap: mobiel ? 4 : 16, flexWrap: mobiel ? "nowrap" : "wrap" }}>
        <Pressable onClick={() => navigate("/")} aria-label="Terug naar stations" style={{ display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 15, fontWeight: 600, minHeight: 44, minWidth: 44, padding: mobiel ? "0 6px" : 0 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 22 }}>arrow_back</span>{!mobiel && "Stations"}
        </Pressable>
        <div className="font-display" style={{ fontWeight: 700, fontSize: mobiel ? 19 : 22, color: T.titleOnBg, flex: 1, minWidth: 0 }}>Cases &amp; TO</div>
        {!mobiel && tabs}
        {mobiel ? (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Meer acties" className="flex h-11 w-11 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1F5C3A]" style={{ color: T.green }}>
              <MoreHorizontal size={22} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuItem className="min-h-[44px] text-base" onSelect={() => setNieuwOpen(true)}><Plus size={17} className="mr-2" />Case toevoegen</DropdownMenuItem>
              <DropdownMenuItem className="min-h-[44px] text-base" onSelect={startImport}><FileUp size={17} className="mr-2" />Importeren uit Excel</DropdownMenuItem>
              <DropdownMenuItem className="min-h-[44px] text-base" onSelect={() => setToonVerborgen((v) => !v)}>{toonVerborgen ? "Verborgen cases verbergen" : "Verborgen cases tonen"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            {tab === "bal" && (
              <div style={{ display: "flex", gap: 8 }}>
                <Pressable onClick={startImport} scale={0.97} className="hover:border-[#1F5C3A]" style={{ ...knop, background: T.surface, color: T.titleOnBg, border: `1px solid ${T.hairline}` }}>
                  <FileUp size={17} />Importeren uit Excel
                </Pressable>
                <Pressable onClick={() => setNieuwOpen(true)} scale={0.97} style={{ ...knop, background: T.green, color: T.surface }}>
                  <Plus size={17} />Case toevoegen
                </Pressable>
              </div>
            )}
            <Pressable onClick={() => setToonVerborgen((v) => !v)} scale={0.97} style={{ minHeight: 44, padding: "0 10px", fontSize: 14, fontWeight: 600, color: T.green }}>
              {toonVerborgen ? "Verborgen verbergen" : "Verborgen tonen"}
            </Pressable>
          </>
        )}
      </div>
      <CaseToevoegenDialog open={nieuwOpen} onOpenChange={setNieuwOpen} />
      {importOpen && <ImportFoutGrens key={importPoging} sluiten={() => setImportOpen(false)} opnieuw={startImport}><ImportScherm sluiten={() => setImportOpen(false)} opnieuw={startImport} poging={importPoging} bestaand={(alleCases ?? []).map((c) => c.station.casenummer ?? "").filter(Boolean)} /></ImportFoutGrens>}
      <main style={{ padding: mobiel ? "12px 12px 48px" : 24, paddingBottom: 60, maxWidth: "100%" }}>
        {mobiel && <div style={{ marginBottom: 12 }}>{tabs}</div>}
        <div role="search" style={{ marginBottom: 12 }}>
          <div style={{ position: "relative", maxWidth: 640 }}>
            <span className="material-symbols-rounded" aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 22, color: SUB }}>search</span>
            <input type="text" inputMode="search" autoComplete="off" value={zoek} onChange={(e) => zetZoek(e.target.value)} aria-label="Zoek in cases" aria-describedby="zoek-hulp"
              placeholder="Zoek op casenummer, naam, WV, actie, reden…" enterKeyHint="search"
              style={{ width: "100%", minHeight: 48, padding: "0 44px 0 42px", borderRadius: 12, border: `1px solid ${T.hairline}`, background: T.surface, fontSize: 16, color: T.titleOnBg }} />
            {zoek && <button type="button" onClick={() => zetZoek("")} aria-label="Zoekopdracht wissen" style={{ position: "absolute", right: 2, top: 2, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", color: SUB, background: "none", border: 0 }}><span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span></button>}
          </div>
          <div id="zoek-hulp" style={{ fontSize: 13, color: SUB, marginTop: 6 }}>
            {zoek ? (alleCases ? <b style={{ color: T.titleOnBg }}>{cases.length} van {gefilterd.length} cases gevonden</b> : null) : <>Tip: meerdere woorden = alles moet kloppen, "exacte zin", -woord sluit uit, of zoek per veld: case: naam: wv: is: behuizing: og: status: dossier: bal: actie: reden: notitie: uitvoering: hold:</>}
          </div>
        </div>
        <div role="group" aria-label="Uitvoering" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: SUB, fontWeight: 600 }}>Uitvoering:</span>
          {FILTER_OPTIES.map((o) => (
            <Pressable key={o.key} aria-pressed={filter === o.key} onClick={() => setFilter(o.key)} scale={0.97} style={{ minHeight: 44, padding: "0 12px", borderRadius: 22, fontSize: 14, fontWeight: 600, background: filter === o.key ? T.green : T.surface, color: filter === o.key ? T.surface : T.titleOnBg, border: `1px solid ${filter === o.key ? T.green : T.hairline}` }}>
              {o.label}{alleCases && <span> {telling[o.key]}</span>}
            </Pressable>
          ))}
        </div>
        {tab === "bal" && alleCases && (
          <div role="group" aria-label="Bal bij partij" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: SUB, fontWeight: 600 }}>Bal bij:</span>
            {PARTIJ_KEUZES.map((p) => {
              const n = p === "alle" ? null : partijTel[p];
              return (
                <Pressable key={p} aria-pressed={partij === p} aria-label={p === "alle" ? "Alle partijen" : `${p}: ${n!.acties} acties in ${n!.cases} cases`} onClick={() => kiesPartij(p)} scale={0.97}
                  style={{ minHeight: 44, padding: "0 12px", borderRadius: 22, fontSize: 14, fontWeight: 600, background: partij === p ? T.titleOnBg : T.surface, color: partij === p ? T.surface : T.titleOnBg, border: `1px solid ${partij === p ? T.titleOnBg : T.hairline}` }}>
                  {p === "alle" ? "Alle" : p}{n ? <span> {n.acties}</span> : null}
                </Pressable>
              );
            })}
          </div>
        )}
        {isError && alleCases && (
          <div role="alert" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px", borderRadius: 12, background: T.surface, border: `1px solid ${T.hairline}`, color: T.titleOnBg, fontSize: 15 }}>
            Bijwerken mislukt — je ziet de laatst geladen cases.
            <Pressable onClick={() => void refetch()} style={{ minHeight: 44, padding: "0 12px", color: T.green, fontWeight: 600 }}>Opnieuw laden</Pressable>
          </div>
        )}
        {isLoading ? (
          <PaginaLader label="Cases laden…" />
        ) : isError && !alleCases ? (
          <div role="alert" style={{ padding: "40px 20px", textAlign: "center", color: T.titleOnBg, fontSize: 16 }}>
            Cases konden niet worden geladen.
            <div><Pressable onClick={() => void refetch()} style={{ marginTop: 10, minHeight: 48, padding: "0 20px", borderRadius: 12, background: T.green, color: T.surface, fontSize: 16, fontWeight: 600 }}>Opnieuw laden</Pressable></div>
          </div>
        ) : !cases.length ? (
          <div style={{ padding: "52px 20px", textAlign: "center", color: SUB, fontSize: 15 }}>{zoek && gefilterd.length ? <>Geen cases gevonden voor “{zoek}”.<div><Pressable onClick={() => zetZoek("")} style={{ marginTop: 8, minHeight: 44, padding: "0 14px", color: T.green, fontWeight: 600 }}>Zoekopdracht wissen</Pressable></div></> : "Geen cases"}</div>
        ) : tab === "bal" ? <><Aandacht cases={cases} open={open} /><Bord cases={cases} open={open} partij={partij} /></> : <Score cases={cases} open={open} filter={filter} mobiel={mobiel} />}
      </main>
    </div>
  );
}
