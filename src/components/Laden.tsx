// Vaste laadvormen rond <TerreVoltLoader />; achtergrond altijd transparant.
import { useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import TerreVoltLoader from "@/components/TerreVoltLoader";

/** Hele pagina of route: 80px, gecentreerd op het scherm. */
export function PaginaLader({ label }: { label?: string }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", zIndex: 5, pointerEvents: "none" }}>
      <TerreVoltLoader size={80} label={label} />
    </div>
  );
}

/** Data in een blok of kaart: 48px, gecentreerd. */
export function BlokLader({ label, minHeight = 120 }: { label?: string; minHeight?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight, width: "100%", background: "transparent" }}>
      <TerreVoltLoader size={48} label={label} />
    </div>
  );
}

/** In knoppen tijdens versturen: 20px. */
export function KnopLader({ label }: { label?: string }) {
  return <TerreVoltLoader size={20} label={label} />;
}

/** Afbeelding met neutrale placeholder en loader (40px) tot hij geladen is. */
export function LaadAfbeelding({ wrapperStyle, wrapperClassName, style, onLoad, onError, ...img }: ImgHTMLAttributes<HTMLImageElement> & { wrapperStyle?: CSSProperties; wrapperClassName?: string }) {
  const [klaar, setKlaar] = useState(false);
  return (
    <span className={wrapperClassName} style={{ position: "relative", display: "block", width: "100%", height: "100%", background: klaar ? "transparent" : "rgba(128,128,128,0.14)", ...wrapperStyle }}>
      <img {...img} onLoad={(e) => { setKlaar(true); onLoad?.(e); }} onError={(e) => { setKlaar(true); onError?.(e); }} style={{ ...style, opacity: klaar ? 1 : 0, transition: "opacity 0.2s ease" }} />
      {!klaar && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><TerreVoltLoader size={40} label="Afbeelding laden…" /></span>}
    </span>
  );
}
