/** Server-side de opleverketen aanzetten (secret blijft op de server). Fouten worden alleen gelogd: cron pakt het later op. */
export function ketenKick(stationId?: string) {
  const p = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/opleverketen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}` },
    body: JSON.stringify({ actie: "tick", ...(stationId ? { station_id: stationId } : {}) }),
  }).then(async (r) => { if (!r.ok) console.error(`opleverketen kick [${r.status}]`); await r.body?.cancel(); })
    .catch((e) => console.error("opleverketen kick mislukt:", (e as Error).message));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(p);
  return p;
}
