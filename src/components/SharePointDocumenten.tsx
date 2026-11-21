import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { T } from "@/components/apple/Primitives";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Doc = { id: string; naam: string; type: string | null; gewijzigd: string };
const cacheKey = (id: string) => `sp-documenten-${id}`;

const icoon = (naam: string) => {
  const ext = naam.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "picture_as_pdf";
  if (["jpg", "jpeg", "png", "heic", "gif"].includes(ext)) return "image";
  if (["dwg", "dxf", "vsd", "vsdx"].includes(ext)) return "architecture";
  if (["xls", "xlsx", "csv"].includes(ext)) return "table_chart";
  if (["doc", "docx", "txt"].includes(ext)) return "description";
  return "draft";
};

// Documenten uit de map "10 Documenten" van de case in SharePoint
export function SharePointDocumenten({ stationId }: { stationId: string }) {
  const { data, isError, refetch } = useQuery({
    queryKey: ["sp-documenten", stationId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ heeft_map: boolean; bestanden: Doc[] }> => {
      try {
        const { data, error } = await supabase.functions.invoke("sharepoint-documenten", { body: { station_id: stationId } });
        if (error) throw error;
        localStorage.setItem(cacheKey(stationId), JSON.stringify(data));
        return data;
      } catch (error) {
        // Offline of fout: laatst bekende lijst
        const oud = localStorage.getItem(cacheKey(stationId));
        if (!navigator.onLine && oud) return JSON.parse(oud);
        throw error;
      }
    },
  });

  if (isError) return <div role="alert" className="mb-5 text-sm">Documenten konden niet worden geladen. <Button variant="ghost" onClick={() => void refetch()}>Opnieuw proberen</Button></div>;
  if (!data?.heeft_map) return null;

  const open = async (d: Doc) => {
    const venster = window.open("", "_blank");
    const { data: r, error } = await supabase.functions.invoke("sharepoint-documenten", { body: { station_id: stationId, bestand_id: d.id } });
    if (error || !r?.url) { venster?.close(); toast.error("Bestand openen is mislukt"); return; }
    if (venster) venster.location.href = r.url; else window.location.href = r.url;
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.subOnBg, marginBottom: 6 }}>Documenten</div>
      {data.bestanden.length === 0 ? (
        <p style={{ fontSize: 14, color: T.subOnBg }}>Nog geen documenten in de map "10 Documenten" in SharePoint.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data.bestanden.map((d) => (
            <button key={d.id} onClick={() => open(d)} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, textAlign: "left", background: "none", border: 0, padding: 0 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 23, color: T.green }}>{icoon(d.naam)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: T.titleOnBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.naam}</span>
              <span style={{ fontSize: 13, color: T.subOnBg, flexShrink: 0 }}>{new Date(d.gewijzigd).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
