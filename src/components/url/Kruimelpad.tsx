import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { SECTIONS, CATEGORIES } from "@/lib/categories";
import { T } from "@/components/apple/Primitives";
import { caseUrl, heeftCase, jaarUrl, jaarVan, opdrachtgeverNaam, opdrachtgeverUrl, sectieUrl, type UrlStation } from "@/lib/urls";

/** van Gelder › 2026 › 0308029 Graaf Hendrikstraat 2 › Trafo › 18 Trafo typeplaatje */
export function Kruimelpad({ station, sectionId, categorieId }: { station: UrlStation; sectionId?: string; categorieId?: number }) {
  const navigate = useNavigate();
  const delen: { label: string; to?: string }[] = [];
  if (heeftCase(station)) {
    delen.push({ label: opdrachtgeverNaam(station), to: opdrachtgeverUrl(station) });
    delen.push({ label: jaarVan(station), to: jaarUrl(station) });
    delen.push({ label: [station.casenummer?.trim(), station.casenaam?.trim()].filter(Boolean).join(" "), to: caseUrl(station) });
  } else {
    delen.push({ label: "Stations", to: "/" });
    delen.push({ label: station.naam_msr ?? "Station", to: caseUrl(station) });
  }
  const sec = SECTIONS.find((s) => s.id === sectionId);
  if (sec) delen.push({ label: sec.label, to: sectieUrl(station, sec.id) });
  const cat = CATEGORIES.find((c) => c.id === categorieId);
  if (cat) delen.push({ label: `${cat.id} ${cat.name}` });
  delen[delen.length - 1].to = undefined;

  return (
    <nav aria-label="Kruimelpad" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 4, rowGap: 2, fontSize: 13, lineHeight: "22px", marginBottom: 8, color: T.subOnBg }}>
      {delen.map((d, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden style={{ color: T.muted }}>›</span>}
          {d.to ? (
            <button type="button" onClick={() => navigate(d.to!)} style={{ border: "none", background: "none", padding: 0, color: T.green, fontSize: 13, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</button>
          ) : (
            <span aria-current="page" style={{ color: T.bodyOnBg, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

export async function deelLink(url: string, titel: string, toast: { success: (m: string) => void; error: (m: string) => void }) {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.share) {
    try { await navigator.share({ title: titel, url }); return; } catch (e) { if ((e as Error)?.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast.success("Link gekopieerd"); }
  catch {
    const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove();
    ok ? toast.success("Link gekopieerd") : toast.error("Kopiëren lukte niet");
  }
}
