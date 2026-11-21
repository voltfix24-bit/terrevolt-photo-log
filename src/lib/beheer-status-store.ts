import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Eén gedeelde beheerstatus (beheer_status-RPC) voor alle weergaven: één poller, gedeelde events. */
type Staat = { tot: string | null; geladen: boolean; compact: number };
let staat: Staat = { tot: null, geladen: false, compact: 0 };
const luisteraars = new Set<() => void>();
let seq = 0;
let stop: (() => void) | null = null;

function zet(n: Partial<Staat>) { staat = { ...staat, ...n }; luisteraars.forEach((l) => l()); }

export async function controleerBeheer() {
  const mijn = ++seq;
  const { data, error } = await supabase.rpc("beheer_status");
  if (mijn !== seq) return; // alleen het nieuwste antwoord telt
  zet({ tot: !error && typeof data === "string" ? data : null, geladen: true });
}
export function zetBeheerVergrendeld() { seq++; zet({ tot: null }); }

function start() {
  const check = () => void controleerBeheer();
  check();
  const interval = window.setInterval(check, 30000);
  window.addEventListener("beheer-veranderd", check);
  window.addEventListener("focus", check);
  const { data: auth } = supabase.auth.onAuthStateChange(() => { window.setTimeout(check, 0); });
  stop = () => {
    window.clearInterval(interval);
    window.removeEventListener("beheer-veranderd", check);
    window.removeEventListener("focus", check);
    auth.subscription.unsubscribe();
  };
}
function subscribe(l: () => void) {
  luisteraars.add(l);
  if (luisteraars.size === 1) start();
  return () => { luisteraars.delete(l); if (luisteraars.size === 0) { stop?.(); stop = null; } };
}
export function useBeheerStatus() { return useSyncExternalStore(subscribe, () => staat); }

/** Een weergave met eigen compacte beheercontrol verbergt zolang hij gemount is de globale balk. */
export function useCompacteBeheer(actief: boolean) {
  useEffect(() => {
    if (!actief) return;
    zet({ compact: staat.compact + 1 });
    return () => zet({ compact: Math.max(0, staat.compact - 1) });
  }, [actief]);
}
export const _beheerStore = { get: () => staat, reset: () => { staat = { tot: null, geladen: false, compact: 0 }; seq = 0; } };
