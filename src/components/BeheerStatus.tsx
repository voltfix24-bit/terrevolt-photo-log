import { useState } from "react";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { zorgVoorBeheer, vergrendelBeheer } from "@/lib/require-pin";
import { useBeheerStatus, zetBeheerVergrendeld } from "@/lib/beheer-status-store";
import { T } from "@/components/apple/Primitives";

const tijd = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

function useBeheerActies() {
  const { tot } = useBeheerStatus();
  const [bezig, setBezig] = useState(false);
  const lock = async () => {
    setBezig(true);
    if (await vergrendelBeheer()) { zetBeheerVergrendeld(); toast.success("Beheer vergrendeld"); }
    else toast.error("Vergrendelen niet bevestigd — controleer je verbinding en probeer opnieuw.");
    setBezig(false);
  };
  const unlock = () => zorgVoorBeheer("Beheer ontgrendelen");
  return { tot, bezig, lock, unlock };
}

/** Display only: the server rechecks authority for every protected write. */
export function BeheerStatus() {
  const { pathname } = useLocation();
  const { compact } = useBeheerStatus();
  const { tot, bezig, lock, unlock } = useBeheerActies();
  if (compact > 0) return null; // de actieve pagina toont een compacte control in haar eigen kop
  return <section aria-label="Beheerstatus" className={`border-b border-border bg-background ${pathname.startsWith("/instellingen") ? "pt-14" : "pt-[env(safe-area-inset-top)]"}`}>
    <div role="status" className="mx-auto flex min-h-12 max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-foreground">
    <span>{tot ? `Beheer ontgrendeld tot ${tijd(tot)}` : "Beheer vergrendeld"}</span>
    <Button variant="ghost" size="sm" disabled={bezig} onClick={tot ? lock : unlock} className="min-h-[44px] gap-1 px-3 text-sm"><LockKeyhole size={16} />{tot ? "Beheer vergrendelen" : "Ontgrendelen"}</Button>
    </div>
  </section>;
}

/** Compacte beheercontrol voor een paginakop; zelfde statusbron en acties als de globale balk. */
export function BeheerCompact() {
  const { tot, bezig, lock, unlock } = useBeheerActies();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={tot ? `Beheer actief tot ${tijd(tot)}` : "Beheer vergrendeld"}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-full border px-2.5 text-[15px] font-semibold"
          style={tot ? { background: T.green, color: T.surface, borderColor: T.green } : { background: T.surface, color: T.green, borderColor: T.cardBorder }}>
          {tot ? <LockKeyholeOpen size={16} aria-hidden /> : <LockKeyhole size={16} aria-hidden />}
          <span className="whitespace-nowrap">{tot ? "Beheer actief" : "Beheer"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-24px)]">
        <div role="status" className="text-[15px] text-foreground">
          {tot ? <>Beheer ontgrendeld tot <strong>{tijd(tot)}</strong>. Daarna is opnieuw de PIN nodig.</> : "Beheer vergrendeld. Kantoorwijzigingen vragen de PIN."}
        </div>
        <Button disabled={bezig} variant={tot ? "outline" : "default"} className="mt-3 min-h-[48px] w-full gap-2 text-[16px]"
          onClick={async () => { if (tot) await lock(); else { setOpen(false); await unlock(); } }}>
          <LockKeyhole size={16} aria-hidden />{tot ? "Beheer vergrendelen" : "Ontgrendelen"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
