import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_stations",
  title: "List stations",
  description: "List stations with status, date and who filled them in, optionally filtered by name or status.",
  inputSchema: {
    search: z.string().optional().describe("Part of the station name to search for."),
    status: z.string().optional().describe("Status filter, e.g. 'in uitvoering', 'opgeleverd', 'goedgekeurd'."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum number of results (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }) => {
    let q = supabaseAnon()
      .from("stations")
      .select("id, naam_msr, behuizingsnummer, type_ruimte, ingevuld_door, datum, status, opdrachtgever, submitted_at")
      .order("datum", { ascending: false })
      .limit(limit ?? 50);
    if (search) q = q.ilike("naam_msr", `%${search}%`);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const stations = (data ?? []).map((s) => ({
      id: s.id, naam: s.naam_msr, behuizingsnummer: s.behuizingsnummer, type: s.type_ruimte,
      ingevuld_door: s.ingevuld_door, datum: s.datum, status: s.status,
      opdrachtgever: s.opdrachtgever, opgeleverd_op: s.submitted_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(stations) }], structuredContent: { stations } };
  },
});
