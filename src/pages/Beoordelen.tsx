import { useState } from "react";
import { beoordeelUrl } from "@/lib/urls";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BlokLader } from "@/components/Laden";
import { Group, Hairline, Row, T, INSET_ROW } from "@/components/apple/Primitives";

const KEY = "beoordelaar-opdrachtgever";

export function getBeoordelaar() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setBeoordelaar(naam: string) {
  try { localStorage.setItem(KEY, naam); } catch { /* */ }
}

export default function Beoordelen() {
  const navigate = useNavigate();
  const [wie, setWie] = useState<string | null>(getBeoordelaar());

  const og = useQuery({
    queryKey: ["opdrachtgevers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opdrachtgevers").select("id, naam").order("naam");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: dossiers, isLoading, isError, refetch } = useQuery({
    queryKey: ["dossiers", wie],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("id, naam_msr, casenummer, casenaam, behuizingsnummer, submitted_at, submitted_by, status, opdrachtgever")
        .eq("opdrachtgever", wie!)
        .eq("uitvoerder", "terrevolt")
        .in("status", ["opgeleverd", "goedgekeurd"])
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!wie,
  });

  const kies = (naam: string) => {
    setBeoordelaar(naam);
    setWie(naam);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "40px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 className="font-display" style={{ fontSize: 30, fontWeight: 500, color: T.titleOnBg, marginBottom: 6 }}>Fotobeoordeling</h1>
        <p style={{ fontSize: 15, color: T.subOnBg, marginBottom: 22 }}>
          {wie ? `Je ziet uitsluitend dossiers die aan ${wie} zijn opgeleverd.` : "Kies voor welke opdrachtgever je beoordeelt."}
        </p>

        {!wie ? (
          <Group>
            {og.isLoading ? <BlokLader label="Opdrachtgevers laden…" /> : og.isError ? (
              <div role="alert" style={{ padding: "24px 20px", textAlign: "center", color: T.subOnBg, fontSize: 15 }}>
                Opdrachtgevers konden niet worden geladen.
                <div><button type="button" onClick={() => void og.refetch()} style={{ minHeight: 44, border: 0, background: "none", color: T.green, fontSize: 16, fontWeight: 600, padding: "0 12px" }}>Opnieuw laden</button></div>
              </div>
            ) : (og.data ?? []).length === 0 ? (
              <div style={{ padding: "30px 20px", textAlign: "center", color: T.subOnBg, fontSize: 15 }}>Nog geen opdrachtgevers</div>
            ) : (og.data ?? []).map((item, index) => (
              <div key={item.id}>
                {index > 0 && <Hairline inset={INSET_ROW} />}
                <Row icon="apartment" title={item.naam} onClick={() => kies(item.naam)} />
              </div>
            ))}
          </Group>
        ) : (
          <>
            <Group>
              {isLoading ? <BlokLader label="Dossiers laden…" /> : isError ? (
                <div role="alert" style={{ padding: "30px 20px", textAlign: "center", color: T.subOnBg, fontSize: 15 }}>
                  Dossiers konden niet worden geladen.
                  <div><button type="button" onClick={() => void refetch()} style={{ minHeight: 44, border: 0, background: "none", color: T.green, fontSize: 16, fontWeight: 600, padding: "0 12px" }}>Opnieuw laden</button></div>
                </div>
              ) : (dossiers ?? []).length === 0 ? (
                <div style={{ padding: "38px 20px", textAlign: "center", color: T.subOnBg, fontSize: 15 }}>Nog geen opgeleverde dossiers</div>
              ) : (
                (dossiers ?? []).map((dossier, index) => (
                  <div key={dossier.id}>
                    {index > 0 && <Hairline inset={INSET_ROW} />}
                    <Row
                      icon={dossier.status === "goedgekeurd" ? "verified" : "fact_check"}
                      iconColor={dossier.status === "goedgekeurd" ? T.done : T.current}
                      title={dossier.naam_msr}
                      subtitle={`${dossier.status === "goedgekeurd" ? "Afgerond" : "Te beoordelen"} · ${dossier.submitted_by ?? "Onbekend"} · ${dossier.submitted_at ? new Date(dossier.submitted_at).toLocaleDateString("nl-NL") : ""}`}
                      onClick={() => navigate(beoordeelUrl(dossier))}
                    />
                  </div>
                ))
              )}
            </Group>
            <button
              type="button"
              onClick={() => { try { localStorage.removeItem(KEY); } catch { /* */ } setWie(null); }}
              style={{ minHeight: 44, marginTop: 8, border: 0, background: "none", color: T.green, fontSize: 16, fontWeight: 600, padding: "0 8px" }}
            >
              Andere opdrachtgever
            </button>
          </>
        )}
      </div>
    </div>
  );
}
