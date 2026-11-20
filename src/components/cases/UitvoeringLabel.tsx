// Label voor de uitvoerder: beige voor Van Gelder, groen voor TerreVolt.
// variant "lang" (casepagina): "Uitvoering …"; "kort" (bord): "TerreVolt"/"Van Gelder"; "afk": "TV"/"VG"
import { T } from "@/components/apple/Primitives";

export function UitvoeringLabel({ uitvoerder, variant = "lang" }: { uitvoerder: "terrevolt" | "van_gelder"; variant?: "lang" | "kort" | "afk" }) {
  const vg = uitvoerder === "van_gelder";
  const bord = variant !== "lang";
  const tekst = variant === "afk" ? (vg ? "VG" : "TV") : `${bord ? "" : "Uitvoering "}${vg ? "Van Gelder" : "TerreVolt"}`;
  return (
    <span
      style={{
        fontSize: bord ? 10.5 : 11,
        fontWeight: 600,
        color: vg ? "#5B4A1E" : bord ? "#1F5C3A" : T.green,
        background: vg ? "#F3EBD6" : bord ? "#DDF0D6" : T.doneBg,
        borderRadius: bord ? 5 : 6,
        padding: "2px 6px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {tekst}
    </span>
  );
}
