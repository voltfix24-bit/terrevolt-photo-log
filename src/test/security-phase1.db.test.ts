import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

// Real PostgreSQL RLS/trigger tests, never a production connection. All data rolls back.
const socket = process.env.PHASE1_TEST_SOCKET;
if (socket && !socket.startsWith("/tmp/phase1/")) throw new Error("Only the isolated local fixture is allowed");
const sql = postgres({ host: socket ?? "/tmp/phase1/socket", port: 55439, database: "phase1_tests", user: "postgres", ssl: false, max: 1 });
type Tx = postgres.TransactionSql;
const user = "10000000-0000-4000-8000-000000000001";
const a = "20000000-0000-4000-8000-000000000001";
const b = "20000000-0000-4000-8000-000000000002";
const station = "30000000-0000-4000-8000-000000000001";
const other = "30000000-0000-4000-8000-000000000002";
const photo = "40000000-0000-4000-8000-000000000001";
const pad = `stations/${station}/test/q_fixture.jpg`;
const url = `https://aiwpseouqechfsvagxkc.supabase.co/storage/v1/object/public/to-fotos/${pad}`;
async function as(tx: Tx, role: "postgres" | "anon" | "authenticated" | "service_role", session = a) {
  await tx.unsafe(`SET LOCAL ROLE ${role}`);
  await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role, ...(role === "authenticated" ? { sub: user, session_id: session } : {}) })}, true)`;
}
async function setup(tx: Tx) {
  await tx`INSERT INTO auth.sessions(id,user_id) VALUES(${a},${user}),(${b},${user})`;
  await tx`INSERT INTO public.user_roles(user_id,role) VALUES(${user},'admin')`;
  await tx`INSERT INTO public.stations(id,naam_msr) VALUES(${station},'Local fixture'),(${other},'Local fixture 2')`;
  await tx`INSERT INTO public.instellingen DEFAULT VALUES`;
  await tx`INSERT INTO storage.objects(bucket_id,name) VALUES('to-fotos',${pad})`;
  await tx`INSERT INTO public.fotos(id,station_id,categorie,storage_path,url) VALUES(${photo},${station},'Test',${pad},${url})`;
  await as(tx, "service_role");
  await tx`SELECT public.beheer_toestaan(${a},${user}),public.beheer_toestaan(${b},${user})`;
  await as(tx, "postgres");
}
async function fixture(fn: (tx: Tx) => Promise<void>) {
  const rollback = new Error("fixture rollback");
  try { await sql.begin(async tx => { await setup(tx); await fn(tx); throw rollback; }); }
  catch (e) { if (e !== rollback) throw e; }
}
async function denied(tx: Tx, query: string) {
  let rejected = false;
  await tx.savepoint(async sp => {
    const result = await sp.unsafe(query);
    // UPDATE/DELETE can fail closed by returning zero rows.
    if (result.command === "UPDATE" || result.command === "DELETE") expect(result.count).toBe(0);
    else throw new Error("Protected operation unexpectedly succeeded");
    rejected = true;
  }).catch(e => { expect(e.code).toBe("42501"); rejected = true; });
  expect(rejected).toBe(true);
}
const active = async (tx: Tx) => (await tx`SELECT public.heeft_beheer() AS ok`)[0].ok;

describe.skipIf(!socket)("phase 1 real isolated PostgreSQL permissions", () => {
  it("creates exactly eight server hours and never extends on token refresh or repeated grant", () => fixture(async tx => {
    const initial = (await tx`SELECT geldig_tot,extract(epoch from (geldig_tot-ontgrendeld_op)) AS seconds FROM public.beheer_sessies WHERE session_id=${a}`)[0];
    expect(Number(initial.seconds)).toBe(8 * 3600);
    await as(tx, "authenticated");
    expect(await active(tx)).toBe(true);
    await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ role: "authenticated", sub: user, session_id: a, iat: 9999999999, exp: 9999999999 })},true)`;
    expect(await active(tx)).toBe(true);
    await as(tx, "service_role");
    const deadline = (await tx`SELECT public.beheer_toestaan(${a},${user}) AS deadline`)[0].deadline;
    expect(deadline).toEqual(initial.geldig_tot);
  }));
  it("allows just before eight hours, rejects at the exact deadline and after", () => fixture(async tx => {
    const boundary = (await tx`SELECT
      public.beheer_deadline_geldig(geldig_tot,NULL,ontgrendeld_op+interval '8 hours'-interval '1 microsecond') AS before,
      public.beheer_deadline_geldig(geldig_tot,NULL,ontgrendeld_op+interval '8 hours') AS at,
      public.beheer_deadline_geldig(geldig_tot,NULL,ontgrendeld_op+interval '8 hours'+interval '1 microsecond') AS after
      FROM public.beheer_sessies WHERE session_id=${a}`)[0];
    expect(boundary).toEqual({ before: true, at: false, after: false });
    await tx`UPDATE public.beheer_sessies SET ontgrendeld_op=statement_timestamp()-interval '8 hours'+interval '1 second',geldig_tot=statement_timestamp()+interval '1 second' WHERE session_id=${a}`;
    await as(tx, "authenticated"); expect(await active(tx)).toBe(true);
    await as(tx, "postgres");
    await tx`UPDATE public.beheer_sessies SET geldig_tot=statement_timestamp(),ontgrendeld_op=statement_timestamp()-interval '8 hours' WHERE session_id=${a}`;
    await as(tx, "authenticated"); expect(await active(tx)).toBe(false);
  }));
  it("B unlock does not extend A; locking A denies old-token reuse without affecting B", () => fixture(async tx => {
    const deadline = (await tx`SELECT geldig_tot FROM public.beheer_sessies WHERE session_id=${a}`)[0].geldig_tot;
    await as(tx, "service_role"); await tx`SELECT public.beheer_toestaan(${b},${user})`;
    await as(tx, "authenticated", a); await tx`SELECT public.beheer_vergrendelen()`;
    expect(await active(tx)).toBe(false);
    await denied(tx, "INSERT INTO public.to_rondes(station_id,nummer) VALUES('" + station + "',1)");
    await as(tx, "authenticated", b); expect(await active(tx)).toBe(true);
    await tx`INSERT INTO public.to_rondes(station_id,nummer) VALUES(${station},1)`;
    await as(tx, "postgres"); expect((await tx`SELECT geldig_tot FROM public.beheer_sessies WHERE session_id=${a}`)[0].geldig_tot).toEqual(deadline);
  }));
  it("expired authenticated retains mechanic rights, but UI bypass gives no office right", () => fixture(async tx => {
    await tx`UPDATE public.beheer_sessies SET geldig_tot=statement_timestamp() WHERE session_id=${a}`;
    await as(tx, "authenticated");
    expect((await tx`UPDATE public.stations SET naam_msr='Ordinary mechanic edit' WHERE id=${station} RETURNING id`).length).toBe(1);
    await tx`INSERT INTO public.stations(naam_msr) VALUES('Ordinary mechanic insert')`;
    await tx`SELECT public.categorienotitie_opslaan(${station},'Test','Local note')`;
    await denied(tx, `UPDATE public.stations SET wv='Office edit' WHERE id='${station}' RETURNING id`);
    await denied(tx, `INSERT INTO public.to_rondes(station_id,nummer) VALUES('${station}',1)`);
    await denied(tx, "UPDATE public.instellingen SET bedrijfsnaam='Unauthorized' RETURNING id");
    await denied(tx, `SELECT public.beheer_toestaan('${a}','${user}')`);
  }));
  it("old session without grant fails closed, including RPC and category management", () => fixture(async tx => {
    await as(tx, "authenticated", "20000000-0000-4000-8000-000000000099");
    expect(await active(tx)).toBe(false);
    await denied(tx, "SELECT public.maak_case('fixture','fixture')");
    await denied(tx, "INSERT INTO public.categorie_instellingen(categorie_id) VALUES(31)");
    await denied(tx, "INSERT INTO public.categorie_voorbeelden(categorie,url,storage_path) VALUES('test','test','test')");
  }));
  it("delivered photo cannot be moved/relinked or bypassed by status downgrade; notes fail explicitly", () => fixture(async tx => {
    await tx`UPDATE public.stations SET status='opgeleverd',submitted_at=statement_timestamp() WHERE id=${station}`;
    await as(tx, "anon");
    await denied(tx, `UPDATE public.stations SET status='concept',submitted_at=NULL WHERE id='${station}' RETURNING id`);
    await denied(tx, `UPDATE public.fotos SET station_id='${other}' WHERE id='${photo}' RETURNING id`);
    await denied(tx, `UPDATE public.fotos SET storage_path='stations/${other}/x.jpg' WHERE id='${photo}' RETURNING id`);
    await denied(tx, `SELECT public.categorienotitie_opslaan('${station}','Test','')`);
    await denied(tx, `INSERT INTO storage.objects(bucket_id,name) VALUES('to-fotos','stations/${station}/x/new.jpg')`);
  }));
  it("open storage supports stable insert retries but never overwrite or source changes", () => fixture(async tx => {
    await as(tx, "anon");
    await tx`INSERT INTO storage.objects(bucket_id,name) VALUES('to-fotos',${pad})`;
    await denied(tx, `UPDATE storage.objects SET name='stations/${other}/x.jpg' WHERE name='${pad}' RETURNING id`);
    await denied(tx, `UPDATE public.fotos SET review_status='approved' WHERE id='${photo}' RETURNING id`);
    await denied(tx, `INSERT INTO public.stations(naam_msr,uitvoerder) VALUES('VG','van_gelder')`);
  }));
  it("rejects fake photo registration and empty skips; real uploaded photos may register", () => fixture(async tx => {
    await as(tx, "anon");
    const missing = `stations/${station}/test/q_missing.jpg`;
    await tx.savepoint(async sp => {
      await sp`INSERT INTO public.fotos(station_id,categorie,storage_path,url) VALUES(${station},'Test',${missing},${url.replace(pad, missing)})`;
    }).then(() => { throw new Error("Missing file accepted"); }, e => expect(e.code).toBe("22023"));
    await tx.savepoint(async sp => { await sp`INSERT INTO public.categorie_skips(station_id,categorie,reden) VALUES(${station},'Test',' ')`; })
      .then(() => { throw new Error("Empty reason accepted"); }, e => expect(e.code).toBe("22023"));
    const uploaded = `stations/${station}/test/q_uploaded.jpg`;
    await tx`INSERT INTO storage.objects(bucket_id,name) VALUES('to-fotos',${uploaded})`;
    expect((await tx`INSERT INTO public.fotos(station_id,categorie,storage_path,url) VALUES(${station},'Test',${uploaded},${url.replace(pad, uploaded)}) RETURNING id`).length).toBe(1);
  }));
  it("public submission rejects incomplete work and accepts complete skipped/photo work exactly once", () => fixture(async tx => {
    await as(tx, "anon");
    await tx.savepoint(async sp => { await sp`SELECT public.fotodossier_aanbieden(${station})`; }).then(() => { throw new Error("Incomplete accepted"); }, e => expect(e.code).toBe("22023"));
    await as(tx, "postgres");
    await tx`INSERT INTO public.categorie_skips(station_id,categorie,reden) SELECT ${station},naam,'Local fixture skip' FROM public.vereiste_fotocategorieen((SELECT s FROM public.stations s WHERE id=${station}))`;
    await as(tx, "anon");
    const first = (await tx`SELECT public.fotodossier_aanbieden(${station}) AS run`)[0].run;
    const retry = (await tx`SELECT public.fotodossier_aanbieden(${station}) AS run`)[0].run;
    expect(first.nieuw).toBe(true); expect(retry.nieuw).toBe(false); expect(retry.id).toBe(first.id);
    await denied(tx, `UPDATE public.stations SET naam_msr='Too late' WHERE id='${station}' RETURNING id`);
  }));
});
afterAll(async () => { await sql.end(); });