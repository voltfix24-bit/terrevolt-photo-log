// Kantoor: "Wie moet wat doen" (9b) + "TO-score" (9c)
import { useState } from "react";
import { FileUp, Plus } from "lucide-react";
import { CaseToevoegenDialog } from "@/components/cases/CaseToevoegenDialog";
import { ExcelImportDialog } from "@/components/cases/ExcelImportDialog";
import { FILTER_OPTIES, bewaarFilter, filterCases, leesFilter, tellingen, uitvoerderVan, type UitvoerderFilter } from "@/lib/cases-filter";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { casesUrl, type UrlStation } from "@/lib/urls";
import { useNavigate } from "react-router-dom";
import { Pressable, R, T } from "@/components/apple/Primitives";
import { CaseItem, PARTIJ_STIJL, Partij, TO_STATUS, caseNaam, caseNr, caseSub, dagenTekst, scoreVan, useCases } from "@/lib/to-rondes";

const SUB = T.bodyOnBg;
const card = { background: T.surface, borderRadius: 14 } as const;

const LANES: { key: Partij | "Derden"; titel: string; sub: string }[] = [
  { key: "TerreVolt", titel: "TerreVolt", sub: "Indienen, nafotograferen, afronden" },
  { key: "Van Gelder", titel: "Van Gelder", sub: "Ter controle of actie bij opdrachtgever" },
  { key: "Liander", titel: "Liander", sub: "Ter controle bij netbeheerder" },
  { key: "Derden", titel: "Derden", sub: "Aannemers en leveranciers" },
];

function StatusPil({ status, prefix }: { status: keyof typeof TO_STATUS; prefix?: string }) {
  const s = TO_STATUS[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: s.dot }} />{prefix}{s.label}
    </span>
  );
}

function Bal({ cases, open }: { cases: CaseItem[]; open: (s: UrlStation) => void }) {
  const items = cases.flatMap((c) => c.bal.map((b) => ({ ...b, c })));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
      {LANES.map((lane) => {
        const st = PARTIJ_STIJL[lane.key];
        const list = items.filter((i) => i.wie === lane.key).sort((a, b) => b.dagen - a.dagen);
        return (
          <section key={lane.key} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <div style={{ padding: "0 4px" }}>
              <div className="font-display" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 19, color: T.titleOnBg }}>
                <span className="material-symbols-rounded" style={{ fontSize: 22, color: st.fg }}>{st.icon}</span>
                {lane.titel}<span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 15, color: SUB }}>{list.length} case{list.length === 1 ? "" : "s"}</span>
              </div>
              <div style={{ fontSize: 13, color: SUB }}>{lane.sub}</div>
            </div>
            {list.length === 0 && <div style={{ ...card, padding: 14, fontSize: 14, color: SUB, background: "rgba(255,255,255,0.6)" }}>Niets open</div>}
            {list.map((i, k) => (
              <Pressable key={i.c.station.id + k} onClick={() => open(i.c.station)} scale={0.98} style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
                  <span className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: T.bodyOnBg }}>{caseNr(i.c.station)}</span>
                  <StatusPil status={i.c.last?.status ?? "open"} prefix={`R${Math.max(1, i.c.rondes.length)} · `} />
                </div>
                <div className="font-display" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25, color: T.titleOnBg, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{caseNaam(i.c.station)}</div>
                {uitvoerderVan(i.c) === "van_gelder" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#5B4A1E", background: "#F3EBD6", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" }}>Uitvoering Van Gelder</span>
                    <span style={{ fontSize: 13, color: T.subOnBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>WV: {i.c.station.wv?.trim() || "—"}</span>
                  </div>
                ) : caseSub(i.c.station) && <div style={{ fontSize: 13, color: T.subOnBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseSub(i.c.station)}</div>}
                <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: PARTIJ_STIJL[lane.key].fg, minWidth: 0 }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_forward</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.txt}{lane.key === "Derden" ? ` · ${i.label}` : ""}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: i.dagen >= 10 ? T.danger : T.bodyOnBg, whiteSpace: "nowrap" }}>{dagenTekst(i.dagen)}</span>
                </div>
              </Pressable>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Score({ cases, open }: { cases: CaseItem[]; open: (s: UrlStation) => void }) {
  const s = scoreVan(cases);
  const max = Math.max(1, ...s.redenen.map((r) => r.n));
  const kpis = [
    { label: "First time right", v: s.ftrPct == null ? "—" : `${s.ftrPct}%`, sub: `${s.ftrN} van ${s.judgedN} beoordeelde cases in één keer goed`, fg: T.green },
    { label: "Gem. rondes tot goedkeuring", v: s.gemRondes == null ? "—" : s.gemRondes.toFixed(1).replace(".", ","), sub: `${s.goedgekeurdN} goedgekeurde cases`, fg: T.titleOnBg },
    { label: "Ter controle", v: String(s.controleN), sub: `${s.controleVG} bij Van Gelder · ${s.controleLiander} bij Liander`, fg: T.upload },
    { label: "Afgekeurd, nog niet herindiend", v: String(s.afgekeurdN), sub: "Zie TerreVolt en Derden", fg: T.danger },
  ];
  const cols = "100px minmax(0,1fr) 120px 130px 150px";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ ...card, padding: "18px 20px" }}>
            <div style={{ fontSize: 14, color: SUB, fontWeight: 500 }}>{k.label}</div>
            <div className="font-display" style={{ fontWeight: 800, fontSize: 34, lineHeight: 1.1, color: k.fg, marginTop: 4 }}>{k.v}</div>
            <div style={{ fontSize: 13, color: SUB, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
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
        <div style={{ ...card, overflow: "auto", gridColumn: "span 2" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "12px 18px", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: SUB, borderBottom: `1px solid ${T.hairline}`, minWidth: 620 }}>
            <span>Case</span><span>Casenaam</span><span>Rondes</span><span>Nu</span><span>Bal bij</span>
          </div>
          {cases.map((c) => (
            <Pressable key={c.station.id} onClick={() => open(c.station)} scale={0.99} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "11px 18px", alignItems: "center", fontSize: 14, borderBottom: "1px solid #F0F3EF", width: "100%", textAlign: "left", minWidth: 620 }}>
              <span className="font-mono" style={{ fontWeight: 600 }}>{caseNr(c.station)}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseNaam(c.station)}</span>
                {caseSub(c.station) && <span style={{ display: "block", fontSize: 12, color: T.subOnBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseSub(c.station)}</span>}
              </span>
              <span style={{ display: "flex", gap: 4 }}>
                {(c.rondes.length ? c.rondes : [{ status: "open" } as any]).map((r, k) => <span key={k} style={{ width: 14, height: 14, borderRadius: 4, background: TO_STATUS[r.status as keyof typeof TO_STATUS].dot }} />)}
              </span>
              <span><StatusPil status={c.last?.status ?? "open"} /></span>
              <span style={{ fontWeight: 600, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[...new Set(c.bal.map((b) => b.label))].join(", ") || "—"}</span>
            </Pressable>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Cases() {
  const navigate = useNavigate();
  const [toonVerborgen, setToonVerborgen] = useState(false);
  const { data: alleCases, isLoading } = useCases({ inclVerborgen: toonVerborgen });
  const [filter, setFilterState] = useState<UitvoerderFilter>(() => leesFilter());
  const setFilter = (f: UitvoerderFilter) => { setFilterState(f); bewaarFilter(f); };
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const telling = tellingen(alleCases ?? []);
  const cases = filterCases(alleCases ?? [], filter);
  const [tab, setTab] = useState<"bal" | "score">("bal");
  const open = (s: UrlStation) => navigate(casesUrl(s));
  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: T.surface, borderBottom: `1px solid ${T.hairline}`, padding: "calc(12px + env(safe-area-inset-top)) 24px 12px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Pressable onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 15, fontWeight: 600, minHeight: 44 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 22 }}>arrow_back</span>Stations
        </Pressable>
        <div className="font-display" style={{ fontWeight: 700, fontSize: 22, color: T.titleOnBg, flex: 1 }}>Cases &amp; TO</div>
        <div style={{ display: "flex", gap: 4, background: T.soft, padding: 4, borderRadius: 12 }}>
          {([["bal", "Wie moet wat doen"], ["score", "TO-score"]] as const).map(([k, l]) => (
            <Pressable key={k} onClick={() => setTab(k)} scale={0.97} style={{ minHeight: 40, padding: "0 14px", borderRadius: 9, fontSize: 15, fontWeight: 600, background: tab === k ? T.green : "transparent", color: tab === k ? T.surface : T.titleOnBg }}>{l}</Pressable>
          ))}
        </div>
        {tab === "bal" && (
          <div style={{ display: "flex", gap: 8 }}>
            <Pressable onClick={() => setImportOpen(true)} scale={0.97} className="hover:border-[#1F5C3A]" style={{ minHeight: 40, padding: "0 14px", borderRadius: 20, fontSize: 15, fontWeight: 600, background: T.surface, color: T.titleOnBg, border: `1px solid ${T.hairline}`, display: "flex", alignItems: "center", gap: 6 }}>
              <FileUp size={17} />Importeren uit Excel
            </Pressable>
            <Pressable onClick={() => setNieuwOpen(true)} scale={0.97} style={{ minHeight: 40, padding: "0 14px", borderRadius: 20, fontSize: 15, fontWeight: 600, background: T.green, color: T.surface, display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={17} />Case toevoegen
            </Pressable>
          </div>
        )}
        <Pressable onClick={() => setToonVerborgen((v) => !v)} scale={0.97} style={{ minHeight: 40, padding: "0 10px", fontSize: 14, fontWeight: 600, color: T.green }}>
          {toonVerborgen ? "Verborgen verbergen" : "Verborgen tonen"}
        </Pressable>
      </div>
      <CaseToevoegenDialog open={nieuwOpen} onOpenChange={setNieuwOpen} />
      <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} bestaand={(alleCases ?? []).map((c) => c.station.casenummer ?? "").filter(Boolean)} />
      <main style={{ padding: "20px 24px 60px", maxWidth: 1400, margin: "0 auto" }}>
        <div role="group" aria-label="Uitvoering" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ fontSize: 14, color: SUB, fontWeight: 600 }}>Uitvoering:</span>
          {FILTER_OPTIES.map((o) => (
            <Pressable key={o.key} aria-pressed={filter === o.key} onClick={() => setFilter(o.key)} scale={0.97} style={{ minHeight: 36, padding: "0 12px", borderRadius: 18, fontSize: 14, fontWeight: 600, background: filter === o.key ? T.green : T.surface, color: filter === o.key ? T.surface : T.titleOnBg, border: `1px solid ${filter === o.key ? T.green : T.hairline}` }}>
              {o.label} <span style={{ opacity: 0.75 }}>{telling[o.key]}</span>
            </Pressable>
          ))}
        </div>
        {isLoading ? (
          <PaginaLader label="Cases laden…" />
        ) : !cases.length ? (
          <div style={{ padding: "52px 20px", textAlign: "center", color: SUB, fontSize: 15 }}>Geen cases</div>
        ) : tab === "bal" ? <Bal cases={cases} open={open} /> : <Score cases={cases} open={open} />}
      </main>
    </div>
  );
}
