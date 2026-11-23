// Keuzechips voor TO-redenen (open / afgekeurd) met "Anders" en optioneel onthouden.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pressable, T } from "@/components/apple/Primitives";
import { REDENEN, OPEN_REDENEN, db, eigenKey, redenLabel, useEigenRedenen, type RedenSoort } from "@/lib/to-rondes";
import { zorgVoorBeheer } from "@/lib/require-pin";

const veld = { border: 0, borderRadius: 10, background: T.soft, padding: "12px 14px", font: "inherit", fontSize: 16, color: T.titleOnBg, outline: "none", width: "100%", minHeight: 44 } as const;

export function RedenKiezer({ soort, gekozen, onToggle, kleur }: {
  soort: RedenSoort; gekozen: string[]; onToggle: (k: string) => Promise<boolean> | void; kleur: { aan: string; uit: string };
}) {
  const qc = useQueryClient();
  const { data: eigen = [] } = useEigenRedenen(soort);
  const [anders, setAnders] = useState(false);
  const [tekst, setTekst] = useState("");
  const [onthoud, setOnthoud] = useState(true);
  const vast = (soort === "open" ? OPEN_REDENEN : REDENEN).map((r) => r.key);
  // Gekozen eigen redenen die (nog) niet in de lijst staan ook tonen
  const opties = [...new Set([...vast, ...eigen, ...gekozen.filter((k) => k.startsWith("eigen:"))])];

  const toevoegen = async () => {
    const label = tekst.trim().replace(/\s+/g, " ");
    if (!label) return;
    const key = eigenKey(label);
    if (!gekozen.includes(key)) { const ok = await onToggle(key); if (ok === false) return; }
    if (onthoud && !eigen.includes(key) && await zorgVoorBeheer()) {
      const { error } = await db.from("to_reden_opties").insert({ soort, label });
      if (error && error.code !== "23505") toast.error("Reden kon niet onthouden worden");
      qc.invalidateQueries({ queryKey: ["reden-opties", soort] });
    }
    setTekst(""); setAnders(false);
  };

  const chip = (on: boolean) => ({ minHeight: 44, padding: "0 14px", borderRadius: 999, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, background: on ? kleur.aan : kleur.uit, color: on ? T.surface : kleur.aan } as const);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {opties.map((k) => {
          const on = gekozen.includes(k);
          return <Pressable key={k} onClick={() => onToggle(k)} scale={0.97} style={chip(on)}><span className="material-symbols-rounded" style={{ fontSize: 17 }}>{on ? "check" : "add"}</span>{redenLabel(k)}</Pressable>;
        })}
        <Pressable onClick={() => setAnders((a) => !a)} scale={0.97} style={{ ...chip(false), boxShadow: `inset 0 0 0 1.5px ${kleur.aan}` }}><span className="material-symbols-rounded" style={{ fontSize: 17 }}>edit</span>Anders</Pressable>
      </div>
      {anders && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 12, boxShadow: "inset 0 0 0 1.5px #E1E8E0" }}>
          <input autoFocus value={tekst} maxLength={80} onChange={(e) => setTekst(e.target.value)} onKeyDown={(e) => e.key === "Enter" && toevoegen()} placeholder="Andere reden" style={veld} />
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={onthoud} onChange={(e) => setOnthoud(e.target.checked)} style={{ width: 20, height: 20 }} />
            Onthouden, zodat deze reden de volgende keer in de lijst staat
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <Pressable onClick={toevoegen} scale={0.97} style={{ ...chip(true), opacity: tekst.trim() ? 1 : 0.5 }}>Toevoegen</Pressable>
            <Pressable onClick={() => { setAnders(false); setTekst(""); }} scale={0.97} style={{ ...chip(false), background: "transparent", color: T.bodyOnBg }}>Annuleren</Pressable>
          </div>
        </div>
      )}
    </div>
  );
}
