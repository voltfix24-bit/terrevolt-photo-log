import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { internetVereist, INTERNET_NODIG } from "@/lib/internet";

/**
 * De pincode wordt op de server gecontroleerd (edge function `pin-sessie`). Bij een juiste code
 * krijgt dit apparaat een beheerderssessie; de database staat verwijderen alleen dan toe.
 */
export async function controleerPin(pin: string, invoke = supabase.functions.invoke.bind(supabase.functions), zetSessie = supabase.auth.setSession.bind(supabase.auth)): Promise<{ ok: boolean; fout?: string }> {
  if (!internetVereist()) return { ok: false, fout: INTERNET_NODIG };
  try {
    const { data, error } = await invoke("pin-sessie", { body: { pin, apparaat: apparaatId() } });
    const d = data as { ok?: boolean; access_token?: string; refresh_token?: string; error?: string } | null;
    if (error || !d?.ok || !d.access_token || !d.refresh_token) {
      let fout = d?.error;
      // FunctionsHttpError: lees de foutmelding uit de response
      const ctx = (error as { context?: Response } | null)?.context;
      if (!fout && ctx && typeof ctx.json === "function") { try { fout = (await ctx.clone().json())?.error; } catch { /* geen json */ } }
      return { ok: false, fout: fout || (error ? "Geen verbinding met de server" : "Onjuiste code") };
    }
    const { error: sErr } = await zetSessie({ access_token: d.access_token, refresh_token: d.refresh_token });
    if (!sErr) window.dispatchEvent(new Event("beheer-veranderd"));
    return sErr ? { ok: false, fout: "Sessie kon niet worden gestart" } : { ok: true };
  } catch {
    return { ok: false, fout: "Geen verbinding met de server" };
  }
}

function apparaatId(): string {
  try {
    let id = localStorage.getItem("to-apparaat");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("to-apparaat", id); }
    return id;
  } catch { return ""; }
}

/** Heeft dit apparaat al een geldige beheerderssessie? */
export async function heeftBeheerSessie(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("heeft_beheer");
    return !error && data === true;
  } catch { return false; }
}

/** Vraagt de pincode alleen als er nog geen beheerderssessie is. */
export async function zorgVoorBeheer(title?: string, description?: string): Promise<boolean> {
  if (!internetVereist()) return false;
  if (await heeftBeheerSessie()) return true;
  const ok = await requirePin(title, description);
  return ok && await heeftBeheerSessie();
}

let host: HTMLDivElement | null = null;
let setOpenExternal: ((state: {
  resolve: (ok: boolean) => void;
  title: string;
  description?: string;
} | null) => void) | null = null;

function PinHost() {
  const [state, setState] = useState<{
    resolve: (ok: boolean) => void;
    title: string;
    description?: string;
  } | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | false>(false);
  const [bezig, setBezig] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOpenExternal = setState;
    return () => { setOpenExternal = null; };
  }, []);

  useEffect(() => {
    if (state) {
      setPin("");
      setError(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [state]);

  if (!state) return null;

  const submit = async () => {
    if (bezig || !pin) return;
    setBezig(true);
    const r = await controleerPin(pin);
    setBezig(false);
    if (r.ok) {
      const resolve = state.resolve;
      setState(null);
      resolve(true);
    } else {
      setError(r.fout || "Onjuiste code");
      setPin("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const cancel = () => {
    const resolve = state.resolve;
    setState(null);
    resolve(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" onClick={cancel} />
      <div className="relative bg-card rounded-2xl p-6 mx-6 max-w-sm w-full shadow-2xl space-y-4 animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-rounded text-primary text-[24px]">lock</span>
          </div>
          <div>
            <h3 className="font-display font-extrabold text-lg text-on-surface">{state.title}</h3>
            {state.description && <p className="text-xs text-muted-foreground">{state.description}</p>}
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false); }}
            placeholder="Toegangscode"
            className={`w-full px-4 py-3.5 bg-surface-low border rounded-xl text-center text-lg font-bold tracking-[0.3em] focus:outline-none focus:ring-2 transition ${
              error ? "border-orange ring-orange/25 animate-shake" : "border-outline-variant/30 focus:ring-primary/25"
            }`}
          />
          {error && <p className="text-sm text-orange font-semibold mt-2 text-center">{error}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <Button
              type="button"
              onClick={cancel}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground bg-surface-container hover:bg-surface-high transition-all"
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={bezig}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary-hover transition-all"
            >
              {bezig ? "Controleren…" : "Ontgrendelen"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ensureMounted() {
  if (host || typeof document === "undefined") return;
  host = document.createElement("div");
  document.body.appendChild(host);
  createRoot(host).render(<PinHost />);
}

let pinVraag: Promise<boolean> | null = null;
export async function requirePin(
  title = "Bevestig met toegangscode",
  description?: string,
): Promise<boolean> {
  if (!internetVereist()) return Promise.resolve(false);
  if (await heeftBeheerSessie()) return true;
  if (pinVraag) return pinVraag;
  ensureMounted();
  pinVraag = new Promise<boolean>((resolve) => {
    const tryOpen = () => {
      if (setOpenExternal) {
        setOpenExternal({ resolve, title, description });
      } else {
        setTimeout(tryOpen, 30);
      }
    };
    tryOpen();
  }).finally(() => { pinVraag = null; });
  return pinVraag;
}


export const BEHEER_NODIG = "Beheer vergrendeld of verlopen — ontgrendel opnieuw met de PIN.";
/** Server check on every protected operation; UI state is never authority. */
export async function eisBeheer(): Promise<void> {
  if (!await zorgVoorBeheer("Beheer ontgrendelen", "Deze wijziging vereist de toegangscode.")) throw new Error(BEHEER_NODIG);
}
export async function vergrendelBeheer(): Promise<boolean> {
  if (!internetVereist()) return false;
  const { data, error } = await supabase.rpc("beheer_vergrendelen");
  if (error || data !== true) return false;
  // Do not signOut globally or locally: the session retains ordinary mechanic rights.
  window.dispatchEvent(new Event("beheer-veranderd"));
  return true;
}

/** Foreground photo/skip actions: ordinary work stays open, delivered work prompts PIN. */
export async function fotowerkVoorActie(stationId: string): Promise<boolean> {
  if (!internetVereist()) return false;
  try {
    const { data, error } = await supabase.rpc("fotowerk_toegestaan", { _id: stationId });
    if (!error && data === true) return true;
    if (!await zorgVoorBeheer("Dossier wijzigen", "Deze wijziging vereist de toegangscode.")) return false;
    const check = await supabase.rpc("fotowerk_toegestaan", { _id: stationId });
    return !check.error && check.data === true;
  } catch { return false; }
}
