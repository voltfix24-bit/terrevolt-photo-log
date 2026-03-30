import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_CATEGORIEEN } from "@/lib/categories";

export default function StationPdf() {
  const { id } = useParams<{ id: string }>();

  const { data: station } = useQuery({
    queryKey: ["station", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: fotos } = useQuery({
    queryKey: ["fotos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fotos")
        .select("*")
        .eq("station_id", id!)
        .order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (!station || !fotos) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#0f1117", color: "#e8eaf0", fontFamily: "DM Sans, sans-serif" }}>
        Laden...
      </div>
    );
  }

  const categoriesWithFotos = FOTO_CATEGORIEEN
    .map((cat) => ({
      name: cat,
      fotos: fotos.filter((f) => f.categorie === cat),
    }))
    .filter((c) => c.fotos.length > 0);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @page { size: A4; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #0f1117; }
      `}</style>

      <div className="no-print" style={{ position: "fixed", top: 16, right: 16, zIndex: 100 }}>
        <button
          onClick={() => window.print()}
          style={{
            background: "#E8541A",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Opslaan als PDF
        </button>
      </div>

      {/* Cover Page */}
      <div style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        background: "#0f1117",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        pageBreakAfter: "always",
        color: "#e8eaf0",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: "#E8541A" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, background: "#6B2D8B" }} />

        <div style={{ textAlign: "center", padding: "0 40px" }}>
          <p style={{ fontSize: 14, letterSpacing: 4, textTransform: "uppercase", color: "#6b7280", marginBottom: 16 }}>
            Terrevolt B.V.
          </p>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>Technische Oplevering</h1>
          <p style={{ fontSize: 24, fontWeight: 600, color: "#E8541A", marginBottom: 48 }}>FOTORAPPORT</p>

          <div style={{ background: "#181c27", borderRadius: 12, padding: 32, textAlign: "left", maxWidth: 400, margin: "0 auto" }}>
            <InfoRow label="Naam MSR" value={station.naam_msr} />
            <InfoRow label="Behuizingsnummer" value={station.behuizingsnummer || "—"} />
            <InfoRow label="Type ruimte" value={station.type_ruimte || "—"} />
            <InfoRow label="Datum" value={station.datum || "—"} />
            <InfoRow label="Ingevuld door" value={station.ingevuld_door || "—"} last />
          </div>
        </div>

        <p style={{ position: "absolute", bottom: 24, fontSize: 11, color: "#6b7280" }}>
          Terrevolt B.V. · Technische Oplevering · Liander Zuidoost
        </p>
      </div>

      {/* Photo Pages */}
      {categoriesWithFotos.map((cat) => {
        const chunks: typeof cat.fotos[] = [];
        for (let i = 0; i < cat.fotos.length; i += 6) {
          chunks.push(cat.fotos.slice(i, i + 6));
        }

        return chunks.map((chunk, ci) => (
          <div
            key={`${cat.name}-${ci}`}
            style={{
              width: "210mm",
              minHeight: "297mm",
              margin: "0 auto",
              background: "#0f1117",
              position: "relative",
              pageBreakAfter: "always",
              color: "#e8eaf0",
              padding: 0,
            }}
          >
            {/* Header */}
            <div style={{ background: "#181c27", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 4, height: 32, background: "#E8541A", borderRadius: 2 }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{cat.name}</p>
                <p style={{ fontSize: 11, color: "#6b7280" }}>{station.naam_msr}</p>
              </div>
            </div>

            {/* Photos */}
            <div style={{
              padding: 24,
              display: "grid",
              gridTemplateColumns: chunk.length === 1 ? "1fr" : "1fr 1fr",
              gap: 16,
            }}>
              {chunk.map((foto) => (
                <div key={foto.id} style={{ borderRadius: 8, overflow: "hidden", background: "#181c27" }}>
                  <img
                    src={foto.url}
                    alt=""
                    style={{ width: "100%", height: "auto", maxHeight: chunk.length <= 2 ? 400 : 220, objectFit: "cover", display: "block" }}
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "12px 24px",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "#6b7280",
            }}>
              <span>{station.naam_msr}</span>
              <span>{station.datum}</span>
            </div>
          </div>
        ));
      })}
    </>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: last ? "none" : "1px solid #2a3050",
      fontSize: 14,
    }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
