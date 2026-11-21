// Mag de opleverknop aan? Alleen als alle noodzakelijke lezingen bevestigd zijn.
// Onbekend (laden/leesfout) is nooit "alles geüpload"; de server controleert daarna nog volledig.
export type Lezing = "laden" | "fout" | "ok";
export function opleverGereedheid(i: { fotos: Lezing; skips: Lezing; wachtrij: number | null | "fout"; opdrachtgever: Lezing }): { kan: boolean; reden: string | null } {
  if (i.fotos === "fout" || i.skips === "fout") return { kan: false, reden: "Fotostatus kon niet worden gelezen — laad opnieuw" };
  if (i.wachtrij === "fout") return { kan: false, reden: "Wachtrij op dit toestel kon niet worden gelezen — laad opnieuw" };
  if (i.opdrachtgever === "fout") return { kan: false, reden: "Opdrachtgevers konden niet worden gelezen — laad opnieuw" };
  if (i.fotos === "laden" || i.skips === "laden" || i.wachtrij === null || i.opdrachtgever === "laden") return { kan: false, reden: "Controleren…" };
  if (i.wachtrij > 0) return { kan: false, reden: "Wacht tot alle foto's geüpload zijn" };
  return { kan: true, reden: null };
}
