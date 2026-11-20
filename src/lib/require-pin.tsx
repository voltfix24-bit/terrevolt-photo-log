import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return false;
  const { data: ok } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  return ok === true;
}

/** Vraagt de pincode alleen als er nog geen beheerderssessie is. */
export async function zorgVoorBeheer(title?: string, description?: string): Promise<boolean> {
  if (!internetVereist()) return false;
  if (await heeftBeheerSessie()) return true;
  return requirePin(title, description);
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cancel} />
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
            <button
              type="button"
              onClick={cancel}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground bg-surface-container hover:bg-surface-high transition-all"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={bezig}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary-hover transition-all"
            >
              {bezig ? "Controleren…" : "Ontgrendelen"}
            </button>
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

export function requirePin(
  title = "Bevestig met toegangscode",
  description?: string,
): Promise<boolean> {
  if (!internetVereist()) return Promise.resolve(false);
  ensureMounted();
  return new Promise((resolve) => {
    const tryOpen = () => {
      if (setOpenExternal) {
        setOpenExternal({ resolve, title, description });
      } else {
        setTimeout(tryOpen, 30);
      }
    };
    tryOpen();
  });
}
