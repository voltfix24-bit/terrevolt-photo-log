import { useLayoutEffect, useRef } from "react";
import { useInstellingen } from "@/hooks/use-theme";

// Dagen tot de SharePoint-sleutel verloopt (null = onbekend)
export function dagenTotVerlopen(datum: string | null | undefined, nu = new Date()): number | null {
  if (!datum) return null;
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  return Math.round((new Date(`${datum}T00:00:00`).getTime() - vandaag.getTime()) / 86_400_000);
}

export function SharePointSleutelBanner() {
  const { data } = useInstellingen();
  const ref = useRef<HTMLDivElement>(null);
  // Werkelijke bannerhoogte als --banner-h, zodat vaste koppen (AppHeader) eronder blijven.
  useLayoutEffect(() => {
    const el = ref.current, root = document.documentElement;
    if (!el) { root.style.setProperty("--banner-h", "0px"); return; }
    const zet = () => root.style.setProperty("--banner-h", `${el.offsetHeight}px`);
    zet(); const ro = new ResizeObserver(zet); ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty("--banner-h", "0px"); };
  });
  const inst = data as any;
  if (!inst) return null;
  const dagen = dagenTotVerlopen(inst.sp_sleutel_verloopt_op);
  const kapot = !!inst.sp_auth_fout || (dagen !== null && dagen < 0);
  if (!kapot && (dagen === null || dagen > 30)) return null;
  const tekst = kapot
    ? "SharePoint-koppeling werkt niet meer: sleutel vernieuwen"
    : `De SharePoint-sleutel verloopt over ${dagen} ${dagen === 1 ? "dag" : "dagen"}`;
  return (
    <div
      ref={ref}
      role="alert"
      style={{
        // z 45: boven AppHeader-inhoud (die start onder --banner-h), onder alle modals/sheets (z-50+ portals).
        position: "sticky", top: 0, zIndex: 45,
        paddingTop: "max(env(safe-area-inset-top), 6px)", paddingBottom: 6, paddingLeft: 16, paddingRight: 16,
        background: kapot ? "#B71C1C" : "#9A4300", color: "#fff",
        fontSize: 14, lineHeight: 1.35, fontWeight: 600, textAlign: "center",
      }}
    >
      {tekst}
    </div>
  );
}
