import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "get_station",
  title: "Get station details",
  description: "Get one station with its photos per category, skipped (NVT) tasks with reasons, and notes.",
  inputSchema: { id: z.string().uuid().describe("Station id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }) => {
    const sb = supabaseAnon();
    const [st, fotos, skips, notes] = await Promise.all([
      sb.from("stations").select("*").eq("id", id).maybeSingle(),
      sb.from("fotos").select("categorie, url, uploaded_at, review_status, review_reden").eq("station_id", id),
      sb.from("categorie_skips").select("categorie, reden").eq("station_id", id),
      sb.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", id),
    ]);
    const err = st.error ?? fotos.error ?? skips.error ?? notes.error;
    if (err) return { content: [{ type: "text", text: err.message }], isError: true };
    if (!st.data) throw new ToolError("Station not found");
    const s = st.data;
    const station = {
      id: s.id, naam: s.naam_msr, behuizingsnummer: s.behuizingsnummer, type: s.type_ruimte,
      ingevuld_door: s.ingevuld_door, datum: s.datum, status: s.status, opdrachtgever: s.opdrachtgever,
      fotos: (fotos.data ?? []).map((f) => ({
        categorie: f.categorie, url: f.url, uploaded_at: f.uploaded_at,
        review_status: f.review_status, review_reden: f.review_reden,
      })),
      nvt: (skips.data ?? []).map((k) => ({ categorie: k.categorie, reden: k.reden })),
      opmerkingen: (notes.data ?? []).map((n) => ({ categorie: n.categorie, opmerking: n.opmerking })),
    };
    return { content: [{ type: "text", text: JSON.stringify(station) }], structuredContent: { station } };
  },
});
