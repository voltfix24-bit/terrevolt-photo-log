import { createClient } from "npm:@supabase/supabase-js@2";

/** Controleert dat de aanroeper een echte beheerderssessie heeft (geldig JWT + rol admin). */
export async function isBeheerder(req: Request): Promise<boolean> {
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") ?? "");
  if (!m) return false;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${m[1]}` } } });
  const { data, error } = await sb.auth.getUser(m[1]);
  if (error || !data?.user) return false;
  const { data: ok } = await sb.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  return ok === true;
}
