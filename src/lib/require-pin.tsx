import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";

const ACCESS_CODE = "24491";

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
  const [error, setError] = useState(false);
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

  const submit = () => {
    if (pin === ACCESS_CODE) {
      const resolve = state.resolve;
      setState(null);
      resolve(true);
    } else {
      setError(true);
      setPin("");
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
          {error && <p className="text-sm text-orange font-semibold mt-2 text-center">Onjuiste code</p>}
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
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary-hover transition-all"
            >
              Ontgrendelen
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
