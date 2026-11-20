// Label "Uitvoering …" op casekaarten en de casepagina: beige voor Van Gelder, groen voor TerreVolt
import { T } from "@/components/apple/Primitives";

export function UitvoeringLabel({ uitvoerder }: { uitvoerder: "terrevolt" | "van_gelder" }) {
  const vg = uitvoerder === "van_gelder";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: vg ? "#5B4A1E" : T.green,
        background: vg ? "#F3EBD6" : T.doneBg,
        borderRadius: 6,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      Uitvoering {vg ? "Van Gelder" : "TerreVolt"}
    </span>
  );
}
