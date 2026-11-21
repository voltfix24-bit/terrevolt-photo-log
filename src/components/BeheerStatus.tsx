import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { zorgVoorBeheer, vergrendelBeheer } from "@/lib/require-pin";

/** Display only: the server rechecks authority for every protected write. */
export function BeheerStatus() {
  const [tot, setTot] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  useEffect(() => {
    let actief = true;
    const check = async () => {
      const { data, error } = await supabase.rpc("beheer_status");
      if (actief) setTot(!error && typeof data === "string" ? data : null);
    };
    void check();
    const interval = window.setInterval(check, 30000);
    window.addEventListener("beheer-veranderd", check);
    window.addEventListener("focus", check);
    const { data: auth } = supabase.auth.onAuthStateChange(() => { window.setTimeout(check, 0); });
    return () => {
      actief = false;
      window.clearInterval(interval);
      window.removeEventListener("beheer-veranderd", check);
      window.removeEventListener("focus", check);
      auth.subscription.unsubscribe();
    };
  }, []);
  const lock = async () => {
    setBezig(true);
    if (await vergrendelBeheer()) { setTot(null); toast.success("Beheer vergrendeld"); }
    else toast.error("Vergrendelen niet bevestigd — controleer je verbinding en probeer opnieuw.");
    setBezig(false);
  };
  return <div role="status" className="fixed bottom-3 left-3 z-[100] flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg">
    <span>{tot ? `Beheer ontgrendeld tot ${new Date(tot).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}` : "Beheer vergrendeld"}</span>
    <Button variant="ghost" size="sm" disabled={bezig} onClick={tot ? lock : () => zorgVoorBeheer("Beheer ontgrendelen")} className="h-8 gap-1 text-xs"><LockKeyhole size={14} />{tot ? "Beheer vergrendelen" : "Ontgrendelen"}</Button>
  </div>;
}