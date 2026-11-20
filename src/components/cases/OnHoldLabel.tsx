import { HOLD_KLEUR } from "@/lib/on-hold";

export function OnHoldLabel() {
  return <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, background: HOLD_KLEUR.bg, color: HOLD_KLEUR.fg, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap", alignSelf: "center" }}>On hold</span>;
}
