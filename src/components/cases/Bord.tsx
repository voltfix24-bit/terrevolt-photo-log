// Bord "Wie moet wat doen": 4 kolommen, groepen per actie, compacte kaarten
import { useState } from "react";
import { ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
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
const MUTED = "#8A9A8D";
const opslagKey = (l: Lane, g: GroepKey) => `cases-bord-groep:${l}:${g}`;
function leesDicht(l: Lane, g: GroepKey) {
  try { const v = localStorage.getItem(opslagKey(l, g)); return v == null ? g === "goedgekeurd" : v === "1"; } catch { return g === "goedgekeurd"; }
}

function Wacht({ i }: { i: BordItem }) {
  if (i.geenDatum) return <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>geen datum</span>;
  const rood = i.dagen >= 10;
  return <span style={{ fontSize: 12, whiteSpace: "nowrap", color: rood ? "#B33A3A" : T.bodyOnBg, fontWeight: rood ? 600 : 400 }}>{dagenTekst(i.dagen)}</span>;
}

function Kaart({ i, open }: { i: BordItem; open: (s: UrlStation) => void }) {
  const s = i.c.station;
  const naam = caseNaam(s);
  const station = (s.naam_msr as string | undefined)?.trim();
  const toonStation = station && station.toLowerCase() !== (s.casenaam ?? "").trim().toLowerCase() && station.toLowerCase() !== naam.toLowerCase();
  const wv = (s.wv as string | undefined)?.trim();
  return (
    <Pressable onClick={() => open(s)} scale={0.98} className="border border-[#DCE6DA] hover:border-[#1F5C3A] hover:shadow-[0_2px_10px_rgba(10,42,24,0.08)] transition-[border-color,box-shadow]"
      style={{ background: T.surface, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, textAlign: "left", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <span className="font-mono" style={{ fontSize: 12, color: T.bodyOnBg }}>{caseNr(s)}</span>
        <UitvoeringLabel uitvoerder={uitvoerderVan(i.c)} variant="kort" />
        <span style={{ marginLeft: "auto" }}><Wacht i={i} /></span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25, color: T.titleOnBg, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{naam}</div>
      {toonStation && <div style={{ fontSize: 12, color: T.subOnBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{station}</div>}
      {i.groep === "actiepunt" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4, fontSize: 12.5, color: "#1F5C3A" }}>
          <CornerDownRight size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{i.txt}{i.lane === "Derden" && i.label !== "Derden" ? ` · ${i.label}` : ""}</span>
        </div>
      )}
      {wv && <div style={{ fontSize: 12, color: T.subOnBg }}>WV: {wv}</div>}
    </Pressable>
  );
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
      <button type="button" onClick={toggle} aria-expanded={!dicht} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 2px", color: kleur, background: "none", border: 0, cursor: "pointer", textAlign: "left" }}>
        <Chev size={16} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>{titel}</span>
        <span style={{ fontSize: 12, fontWeight: 600, background: T.surface, color: T.bodyOnBg, borderRadius: 10, padding: "1px 8px" }}>{items.length}</span>
      </button>
      {!dicht && (g === "goedgekeurd" ? (
        <div style={{ background: T.surface, borderRadius: 12, border: "1px solid #DCE6DA", overflow: "hidden" }}>
          {zicht.map((i, k) => (
            <Pressable key={i.c.station.id + k} onClick={() => open(i.c.station)} scale={0.99} className="hover:bg-[#F3F8F2]"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", width: "100%", textAlign: "left", borderTop: k ? "1px solid #DCE6DA" : "none" }}>
              <span className="font-mono" style={{ fontSize: 12, color: T.bodyOnBg, flexShrink: 0 }}>{caseNr(i.c.station)}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.titleOnBg, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseNaam(i.c.station)}</span>
              <UitvoeringLabel uitvoerder={uitvoerderVan(i.c)} variant="afk" />
            </Pressable>
          ))}
        </div>
      ) : zicht.map((i, k) => <Kaart key={i.c.station.id + k} i={i} open={open} />))}
      {!dicht && items.length > max && (
        <button type="button" onClick={() => setAlles((a) => !a)} style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 600, color: T.green, background: "none", border: 0, cursor: "pointer", padding: "2px 4px" }}>
          {alles ? "Toon minder" : `Toon nog ${items.length - max}`}
        </button>
      )}
    </div>
  );
}

export function Bord({ cases, open }: { cases: CaseItem[]; open: (s: UrlStation) => void }) {
  const items = bordItems(cases);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]" style={{ gap: 18 }}>
      {LANES.map((lane) => {
        const st = PARTIJ_STIJL[lane.key];
        const { groepen, open: n } = groepenVan(items, lane.key);
        return (
          <section key={lane.key} aria-label={lane.key} style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ padding: "0 2px" }}>
              <div className="font-display" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 19, color: T.titleOnBg }}>
                <span className="material-symbols-rounded" style={{ fontSize: 22, color: st.fg }}>{st.icon}</span>
                {lane.key}<span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: T.bodyOnBg }}>{n} open</span>
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
