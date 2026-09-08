import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Group, Hairline, Row, T, INSET_ROW } from "@/components/apple/Primitives";

const KEY = "beoordelaar-opdrachtgever";

export function getBeoordelaar() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export default function Beoordelen() {
  const navigate = useNavigate();
  const [wie, setWie] = useState<string | null>(getBeoordelaar());

  const { data: opdrachtgevers } = useQuery({
    queryKey: ["opdrachtgevers"],
    queryFn: async () => {
      const { data } = await supabase.from("opdrachtgevers").select("id, naam").order("naam");
      return data ?? [];
    },
  });

  const { data: dossiers } = useQuery({
    queryKey: ["dossiers", wie],
    queryFn: async () => {
      const { data } = await supabase
        .from("stations")
        .select("id, naam_msr, submitted_at, submitted_by, status, opdrachtgever")
        .eq("opdrachtgever", wie!)
        .in("status", ["opgeleverd", "goedgekeurd"])
        .order("submitted_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!wie,
  });

  const kies = (naam: string) => {
    try { localStorage.setItem(KEY, naam); } catch { /* */ }
    setWie(naam);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "40px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 className="font-display" style={{ fontSize: 30, fontWeight: 500, color: T.titleOnBg, marginBottom: 6 }}>Beoordelen</h1>
        <p style={{ fontSize: 15, color: T.subOnBg, marginBottom: 22 }}>
          {wie ? `Je ziet uitsluitend dossiers die aan ${wie} zijn opgeleverd.` : "Kies voor welke opdrachtgever je beoordeelt."}
        </p>

        {!wie ? (
          <Group>
            {(opdrachtgevers ?? []).map((item, index) => (
              <div key={item.id}>
                {index > 0 && <Hairline inset={INSET_ROW} />}
                <Row icon="apartment" title={item.naam} onClick={() => kies(item.naam)} />
              </div>
            ))}
          </Group>
        ) : (
          <>
            <Group>
              {(dossiers ?? []).length === 0 ? (
                <div style={{ padding: "38px 20px", textAlign: "center", color: T.subOnBg, fontSize: 15 }}>Nog geen opgeleverde dossiers</div>
              ) : (
                (dossiers ?? []).map((dossier, index) => (
                  <div key={dossier.id}>
                    {index > 0 && <Hairline inset={INSET_ROW} />}
                    <Row
                      icon={dossier.status === "goedgekeurd" ? "verified" : "inventory_2"}
                      iconColor={dossier.status === "goedgekeurd" ? T.done : T.current}
                      title={dossier.naam_msr}
                      subtitle={`${dossier.submitted_by ?? "Onbekend"} · ${dossier.submitted_at ? new Date(dossier.submitted_at).toLocaleDateString("nl-NL") : ""}`}
                      onClick={() => navigate(`/beoordelen/${dossier.id}`)}
                    />
                  </div>
                ))
              )}
            </Group>
            <button
              type="button"
              onClick={() => { try { localStorage.removeItem(KEY); } catch { /* */ } setWie(null); }}
              style={{ border: 0, background: "none", color: T.green, fontSize: 15, padding: "0 5px" }}
            >
              Andere opdrachtgever
            </button>
          </>
        )}
      </div>
    </div>
  );
}
