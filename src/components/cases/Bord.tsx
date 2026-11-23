// Bord "Wie moet wat doen": 4 kolommen, groepen per actie, compacte kaarten
import { useState } from "react";
import { ChevronDown, ChevronRight, CornerDownRight, PauseCircle } from "lucide-react";
import { hervattenVoorbij } from "@/lib/on-hold";
import { Pressable, T } from "@/components/apple/Primitives";
import { UitvoeringLabel } from "@/components/cases/UitvoeringLabel";
import { uitvoerderVan } from "@/lib/cases-filter";
import { GROEP_KLEUR, bordItems, groepenVan, type BordItem, type GroepKey, type Lane } from "@/lib/bord-groepen";
import { PARTIJ_STIJL, caseNaam, caseNr, dagenTekst, type CaseItem } from "@/lib/to-rondes";
import type { UrlStation } from "@/lib/urls";

const LANES: { key: Lane; sub: string }[] = [
  { key: "TerreVolt", sub: "Indienen, nafotograferen, afronden" },
  { key: "Van Gelder", sub: "Ter controle of actie bij opdrachtgever" },
  { key: "Liander", sub: "Ter controle bij netbeheerder" },
  { key: "Derden", sub: "Aannemers en leveranciers" },
];
const MUTED = T.subOnBg;
const LAAT = "#9A4A06";
const opslagKey = (l: Lane, g: GroepKey) => `cases-bord-groep:${l}:${g}`;
const standaardDicht = (g: GroepKey) => g === "goedgekeurd" || g === "onhold";
function leesDicht(l: Lane, g: GroepKey) {
  try { const v = localStorage.getItem(opslagKey(l, g)); return v == null ? standaardDicht(g) : v === "1"; } catch { return standaardDicht(g); }
}

function Wacht({ i }: { i: BordItem }) {
  if (i.groep === "onhold") {
    const laat = hervattenVoorbij(i.c.station);
    return <span style={{ fontSize: 12, whiteSpace: "nowrap", color: laat ? LAAT : T.bodyOnBg, fontWeight: laat ? 600 : 400 }}>sinds {i.dagen === 1 ? "1 dag" : `${i.dagen} dagen`}{laat ? " · hervatdatum verstreken" : ""}</span>;
  }
  if (i.geenDatum) return <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>geen datum</span>;
  // Rood vanaf tien dagen is een aandachtsindicatie, geen harde deadline.
  const rood = i.dagen >= 10;
  return <span title={rood ? "Wacht 10 dagen of langer (indicatie, geen deadline)" : undefined} style={{ fontSize: 12, whiteSpace: "nowrap", color: rood ? "#B33A3A" : T.bodyOnBg, fontWeight: rood ? 600 : 400 }}>{dagenTekst(i.dagen)}</span>;
}

function Kaart({ alle, open }: { alle: BordItem[]; open: (s: UrlStation) => void }) {
  const i = alle[0];
  const s = i.c.station;
  const naam = caseNaam(s);
  const station = (s.naam_msr as string | undefined)?.trim();
  const toonStation = station && station.toLowerCase() !== (s.casenaam ?? "").trim().toLowerCase() && station.toLowerCase() !== naam.toLowerCase();
  const wv = (s.wv as string | undefined)?.trim();
  return (
    <Pressable onClick={() => open(s)} scale={0.98} className="border border-[#DCE6DA] hover:border-[#1F5C3A] hover:shadow-[0_2px_10px_rgba(10,42,24,0.08)] transition-[border-color,box-shadow]"
      style={{ background: T.surface, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, textAlign: "left", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", flexWrap: "wrap" }}>
        <span className="font-mono" style={{ fontSize: 12, color: T.bodyOnBg }}>{caseNr(s)}</span>
        <UitvoeringLabel uitvoerder={uitvoerderVan(i.c)} variant="kort" />
        <span style={{ marginLeft: "auto" }}><Wacht i={i} /></span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25, color: T.titleOnBg, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{naam}</div>
      {toonStation && <div style={{ fontSize: 12, color: T.subOnBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{station}</div>}
      {(i.groep === "actiepunt" || i.groep === "onhold") && alle.map((a, j) => (
        <div key={j} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, fontSize: 13, color: "#1F5C3A" }}>
            <CornerDownRight size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{a.txt}{a.lane === "Derden" && a.label !== "Derden" && a.wie === a.lane ? ` · ${a.label}` : ""}</span>
          </div>
          {a.groep !== "onhold" && a.wie !== a.lane && <div style={{ fontSize: 12, fontWeight: 600, color: T.bodyOnBg, paddingLeft: 18 }}>Actie bij: {a.label}</div>}
        </div>
      ))}
      {/* Onderliggende actiehouder wanneer die afwijkt van de casepartij (bijv. Van Gelder-case, actie bij TerreVolt). */}
      {i.groep !== "actiepunt" && i.groep !== "onhold" && i.wie !== i.lane && (
        <div style={{ fontSize: 12, fontWeight: 600, color: T.bodyOnBg }}>Actie bij: {i.label}</div>
      )}
      {wv && <div style={{ fontSize: 12, overflowWrap: "anywhere", color: T.subOnBg }}>WV: {wv}</div>}
    </Pressable>
  );
}

/** Voeg acties van dezelfde case samen tot één kaart (volgorde van eerste voorkomen). */
export function perCase(items: BordItem[]): BordItem[][] {
  const m = new Map<string, BordItem[]>();
  for (const i of items) { const k = i.c.station.id; const l = m.get(k); if (l) l.push(i); else m.set(k, [i]); }
  return [...m.values()];
}

function Groep({ lane, g, titel, items, open }: { lane: Lane; g: GroepKey; titel: string; items: BordItem[]; open: (s: UrlStation) => void }) {
  const [dicht, setDicht] = useState(() => leesDicht(lane, g));
  const [alles, setAlles] = useState(false);
  const max = g === "goedgekeurd" ? 6 : 4;
  const zicht = alles ? items : items.slice(0, max);
  const toggle = () => setDicht((d) => { try { localStorage.setItem(opslagKey(lane, g), d ? "0" : "1"); } catch { /* geen opslag */ } return !d; });
  const kleur = GROEP_KLEUR[g] ?? T.titleOnBg;
  const Chev = dicht ? ChevronRight : ChevronDown;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" onClick={toggle} aria-expanded={!dicht} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1F5C3A] rounded-lg" style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px", minHeight: 44, color: kleur, background: "none", border: 0, cursor: "pointer", textAlign: "left" }}>
        <Chev size={16} />
        {g === "onhold" && <PauseCircle size={15} />}
        <span style={{ fontSize: 13, fontWeight: 700 }}>{titel}</span>
        <span aria-label={`${items.length} actie${items.length === 1 ? "" : "s"}`} style={{ fontSize: 12, fontWeight: 600, background: T.surface, color: T.bodyOnBg, borderRadius: 10, padding: "1px 8px" }}>{items.length}</span>
      </button>
      {!dicht && (g === "goedgekeurd" ? (
        <div style={{ background: T.surface, borderRadius: 12, border: "1px solid #DCE6DA", overflow: "hidden" }}>
          {zicht.map((i, k) => (
            <Pressable key={i.c.station.id + k} onClick={() => open(i.c.station)} scale={0.99} className="hover:bg-[#F3F8F2]"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", minHeight: 48, width: "100%", textAlign: "left", borderTop: k ? "1px solid #DCE6DA" : "none" }}>
              <span className="font-mono" style={{ fontSize: 12, color: T.bodyOnBg, flexShrink: 0 }}>{caseNr(i.c.station)}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.titleOnBg, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseNaam(i.c.station)}</span>
              <UitvoeringLabel uitvoerder={uitvoerderVan(i.c)} variant="afk" />
            </Pressable>
          ))}
        </div>
      ) : perCase(zicht).map((g) => <Kaart key={g[0].c.station.id} alle={g} open={open} />))}
      {!dicht && items.length > max && (
        <button type="button" onClick={() => setAlles((a) => !a)} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1F5C3A] rounded-lg" style={{ alignSelf: "flex-start", fontSize: 14, fontWeight: 600, color: T.green, background: "none", border: 0, cursor: "pointer", padding: "0 8px", minHeight: 44 }}>
          {alles ? "Toon minder" : `Toon nog ${items.length - max}`}
        </button>
      )}
    </div>
  );
}

export function Bord({ cases, open, partij = "alle" }: { cases: CaseItem[]; open: (s: UrlStation) => void; partij?: Lane | "alle" }) {
  const items = bordItems(cases);
  const lanes = partij === "alle" ? LANES : LANES.filter((l) => l.key === partij);
  return (
    <div className={partij === "alle" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]" : "grid grid-cols-1"} style={{ gap: 18 }}>
      {lanes.map((lane) => {
        const st = PARTIJ_STIJL[lane.key];
        const { groepen, open: n, openCases } = groepenVan(items, lane.key);
        return (
          <section key={lane.key} aria-label={lane.key} style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ padding: "0 2px" }}>
              <div className="font-display" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 19, color: T.titleOnBg }}>
                <span className="material-symbols-rounded" style={{ fontSize: 22, color: st.fg }}>{st.icon}</span>
                {lane.key}<span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: T.bodyOnBg }}>{n} {n === 1 ? "actie" : "acties"} · {openCases} {openCases === 1 ? "case" : "cases"} open</span>
              </div>
              <div style={{ fontSize: 13, color: T.bodyOnBg }}>{lane.sub}</div>
            </div>
            {groepen.length === 0 && <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 12, padding: 12, fontSize: 14, color: T.bodyOnBg }}>Niets open</div>}
            {groepen.map((g) => <Groep key={g.key} lane={lane.key} g={g.key} titel={g.titel} items={g.items} open={open} />)}
          </section>
        );
      })}
    </div>
  );
}
