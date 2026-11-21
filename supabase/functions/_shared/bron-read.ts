// An inventory error is never an empty inventory. Keyset pages survive API row limits.
export async function volledigeRead(db: any, table: string, columns: string, key = "id", filter?: (q: any) => any): Promise<any[]> {
  const rows: any[] = [];
  let after: string | null = null;
  for (;;) {
    let query = db.from(table).select(columns).order(key).limit(250);
    if (filter) query = filter(query);
    if (after !== null) query = query.gt(key, after);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error(`Bronread mislukt: ${table} (${error?.message ?? "geen resultaat"})`);
    if (!data.length) return rows;
    const next = data[data.length - 1][key];
    if (typeof next !== "string" || next === after) throw new Error(`Ongeldige pagina: ${table}`);
    rows.push(...data); after = next;
  }
}

export async function stationOntbreekt(db: any, id: string) {
  const { data, error } = await db.from("stations").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`Stationbestaan niet bevestigd: ${error.message}`);
  return data === null;
}
export async function verweesdeMappings(db: any) {
  const [mappings,stations] = await Promise.all([volledigeRead(db,"sharepoint_sync","station_id, sharepoint_item_id","station_id"),volledigeRead(db,"stations","id")]);
  const ids = new Set(stations.map(s => s.id));
  return mappings.filter(m => !ids.has(m.station_id));
}