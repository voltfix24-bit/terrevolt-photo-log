import { useEffect, type ReactNode } from "react";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { internetVereist } from "@/lib/internet";
import { supabase } from "@/integrations/supabase/client";
import { useUrlIndex } from "@/hooks/use-url-index";
import {
  UUID_RE, isVanGelder, beoordeelUrl, caseNrSlug, caseUrl, casesUrl, heeftCase, jaarVan, leesSub, opdrachtgeverSlug,
  slug, stationSlug, subUrl, zoekOpCaseSlug, zoekOpStationSlug, type Sub, type UrlStation,
} from "@/lib/urls";
import StationDetail from "./StationDetail";
import Opleveren from "./Opleveren";
import CaseDetail from "./CaseDetail";
import BeoordeelDossier from "./BeoordeelDossier";
import NotFound from "./NotFound";
import { Group, Hairline, Pressable, T, ROW_MIN, ROW_PAD_X } from "@/components/apple/Primitives";

const Leeg = () => <PaginaLader />;
const pad = (p: string) => decodeURIComponent(p).replace(/\/+$/, "").toLowerCase();

/** Zorgt voor een replace-redirect zodra de huidige url niet canoniek is. */
function Canoniek({ naar, children }: { naar: string; children: ReactNode }) {
  const loc = useLocation();
  const [doel, q] = naar.split("?");
  if (pad(loc.pathname) !== pad(doel)) return <Navigate to={{ pathname: doel, search: q ? `?${q}` : loc.search }} replace />;
  return <>{children}</>;
}

function Weergave({ station, sub }: { station: UrlStation; sub: Sub }) {
  if (isVanGelder(station)) return <Navigate to={casesUrl(station)} replace />;
  if (sub.soort === "opleveren") return <Opleveren stationId={station.id} />;
  if (sub.soort === "rapport") return <RapportOpener station={station} />;
  return <StationDetail stationId={station.id} sub={sub} />;
}

function RapportOpener({ station }: { station: UrlStation }) {
  const navigate = useNavigate();
  useEffect(() => {
    let weg = false;
    (async () => {
      if (!internetVereist()) { navigate(caseUrl(station), { replace: true }); return; }
      const { data, error } = await supabase.functions.invoke("oplever-rapport", { body: { station_id: station.id, actie: "rapport-url" } });
      const url = (data as { rapport_url?: string })?.rapport_url;
      if (weg) return;
      if (error || !url) { toast.error("Rapport nog niet beschikbaar"); navigate(caseUrl(station), { replace: true }); return; }
      if ((data as { pdf_status?: string })?.pdf_status === "bezig") toast("PDF-rapport wordt gemaakt, je ziet nu de eenvoudige versie");
      window.location.replace(url);
    })();
    return () => { weg = true; };
  }, [station, navigate]);
  return <PaginaLader label="Rapport openen…" />;
}

/* /c/:casenummer */
export function KorteLink() {
  const { nr = "" } = useParams();
  const { data } = useUrlIndex(nr);
  if (!data) return <Leeg />;
  const s = data.stations.find((x) => caseNrSlug(x) === slug(nr)) ?? zoekOpCaseSlug(data.stations, nr)[0];
  return s ? <Navigate to={isVanGelder(s) ? casesUrl(s) : caseUrl(s)} replace /> : <NotFound />;
}

/* /stations/:key/* — uuid (oud) of behuizingsnummer-naam */
export function StationsRoute() {
  const { key = "", "*": rest = "" } = useParams();
  const { data, isFetching } = useUrlIndex(key);
  if (!data) return <Leeg />;
  const s = zoekOpStationSlug(data.stations, key);
  if (!s) return isFetching ? <Leeg /> : <NotFound />;
  const sub = leesSub(rest.split("/"));
  return <Canoniek naar={subUrl(s, sub)}><Weergave station={s} sub={sub} /></Canoniek>;
}

/* /:opdrachtgever[/:jaar[/:case/*]] */
export function OpdrachtgeverRoute() {
  const { og = "", jaar, case: caseKey, "*": rest = "" } = useParams();
  const [sp] = useSearchParams();
  const { data, isFetching } = useUrlIndex(caseKey, og);
  if (!data) return <Leeg />;
  const ogNaam = data.opdrachtgevers.find((o) => slug(o) === slug(og));
  const bekendInStations = data.stations.some((s) => opdrachtgeverSlug(s) === slug(og));
  if (!ogNaam && !bekendInStations) return <NotFound />;

  if (!caseKey) {
    if (jaar && !/^\d{4}$/.test(jaar)) return <NotFound />;
    const lijst = data.stations.filter((s) => !isVanGelder(s) && heeftCase(s) && opdrachtgeverSlug(s) === slug(og) && (!jaar || jaarVan(s) === jaar));
    return <CaseLijst titel={jaar ? `${ogNaam ?? og} · ${jaar}` : ogNaam ?? og} og={ogNaam ?? og} jaar={jaar} stations={lijst} />;
  }

  const alle = zoekOpCaseSlug(data.stations, caseKey);
  if (alle.length === 0) return isFetching ? <Leeg /> : <NotFound />;
  if (alle.every(isVanGelder)) return <Navigate to={casesUrl(alle[0])} replace />;
  const matches = alle.filter((m) => !isVanGelder(m));
  let s = matches[0];
  if (matches.length > 1) {
    const kies = sp.get("station");
    const gekozen = kies ? matches.find((m) => stationSlug(m) === kies.toLowerCase() || m.id === kies) : undefined;
    if (!gekozen) return <CaseLijst titel={`Case ${matches[0].casenummer?.trim()}`} stations={matches} metStation />;
    s = gekozen;
  }
  const sub = leesSub(rest.split("/"));
  const doel = subUrl(s, sub) + (matches.length > 1 ? `?station=${stationSlug(s) || s.id}` : "");
  return <Canoniek naar={doel}><Weergave station={s} sub={sub} /></Canoniek>;
}

/* /cases/:key en /beoordelen/:key — eigen schermen, leesbare variant + redirect van uuid */
function eigenScherm(soort: "cases" | "beoordelen") {
  return function EigenScherm() {
    const { key = "" } = useParams();
    const { data, isFetching } = useUrlIndex(key);
    if (!data) return <Leeg />;
    const s = UUID_RE.test(key) ? data.stations.find((x) => x.id === key) : (zoekOpCaseSlug(data.stations, key)[0] ?? zoekOpStationSlug(data.stations, key));
    if (!s) return isFetching ? <Leeg /> : <NotFound />;
    if (soort === "beoordelen" && isVanGelder(s)) return <Navigate to={casesUrl(s)} replace />;
    const doel = soort === "cases" ? casesUrl(s) : beoordeelUrl(s);
    return <Canoniek naar={doel}>{soort === "cases" ? <CaseDetail stationId={s.id} /> : <BeoordeelDossier stationId={s.id} />}</Canoniek>;
  };
}
export const CasesSleutelRoute = eigenScherm("cases");
export const BeoordelenSleutelRoute = eigenScherm("beoordelen");

function CaseLijst({ titel, og, jaar, stations, metStation }: { titel: string; og?: string; jaar?: string; stations: UrlStation[]; metStation?: boolean }) {
  const navigate = useNavigate();
  const lijst = [...stations].sort((a, b) => (b.casenummer ?? "").localeCompare(a.casenummer ?? ""));
  const jaren = og && !jaar ? [...new Set(stations.map(jaarVan))].sort().reverse() : [];
  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <main className="max-w-3xl mx-auto px-3" style={{ paddingTop: "calc(10px + env(safe-area-inset-top))", paddingBottom: 40 }}>
        <Pressable onClick={() => navigate(og && jaar ? `/${slug(og)}` : "/")} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 2, color: T.green, fontSize: 17 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 21 }}>chevron_left</span>{og && jaar ? og : "Stations"}
        </Pressable>
        <h1 className="font-display" style={{ fontSize: 28, fontWeight: 500, color: T.titleOnBg, margin: "6px 8px 4px" }}>{titel}</h1>
        <p style={{ fontSize: 14, color: T.subOnBg, margin: "0 8px 16px" }}>{lijst.length === 1 ? "1 case" : `${lijst.length} cases`}</p>
        {jaren.length > 1 && (
          <div style={{ display: "flex", gap: 16, margin: "0 8px 14px" }}>
            {jaren.map((j) => <Pressable key={j} onClick={() => navigate(`/${slug(og)}/${j}`)} style={{ color: T.green, fontSize: 15 }}>{j}</Pressable>)}
          </div>
        )}
        {lijst.length === 0 ? <p style={{ textAlign: "center", color: T.subOnBg, padding: 30 }}>Geen cases</p> : (
          <Group>
            {lijst.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <Hairline />}
                <Pressable scale={0.985} onClick={() => navigate(caseUrl(s) + (metStation ? `?station=${stationSlug(s) || s.id}` : ""))} style={{ width: "100%", minHeight: ROW_MIN, padding: `12px ${ROW_PAD_X}px`, display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, color: T.rowText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span className="font-mono" style={{ fontSize: 15 }}>{s.casenummer?.trim()}</span> {metStation ? s.naam_msr : s.casenaam?.trim()}
                    </div>
                    <div style={{ fontSize: 14, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metStation ? s.behuizingsnummer : `${s.naam_msr ?? ""} · ${jaarVan(s)}`}</div>
                  </div>
                  <span className="material-symbols-rounded" style={{ fontSize: 19, color: T.chevron }}>chevron_right</span>
                </Pressable>
              </div>
            ))}
          </Group>
        )}
      </main>
    </div>
  );
}

