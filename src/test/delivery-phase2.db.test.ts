import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { uploadEnRegistreer } from "@/lib/fotos-service";

const socket = process.env.PHASE1_TEST_SOCKET;
if (socket && socket !== "/tmp/phase1/socket") throw new Error("Only the disposable local test cluster is allowed");
const options = { host: "/tmp/phase1/socket", port: 55439, database: "phase1_tests", user: "postgres", ssl: false as const, max: 1 };
const admin = postgres(options);
const connections = Array.from({ length: 20 }, () => postgres(options));
async function role(db: postgres.Sql, value: "service_role" | "anon" | "authenticated", user?: string, session?: string) {
  await db.unsafe(`SET ROLE ${value}`);
  await db`SELECT set_config('request.jwt.claims',${JSON.stringify({ role: value, sub: user, session_id: session })},false)`;
}
async function concurrent<T>(fn: (db: postgres.Sql, index: number) => Promise<T>) {
  let start: (() => void) | undefined;
  const barrier = new Promise<void>(resolve => { start = resolve; });
  const pids = await Promise.all(connections.map(async c => (await c`SELECT pg_backend_pid() AS pid`)[0].pid));
  expect(new Set(pids).size).toBe(20);
  const pending = connections.map(async (db,i) => { await barrier; return fn(db,i); });
  start?.();
  return Promise.all(pending);
}
async function fixture(fn: (station: string, user: string, session: string) => Promise<void>) {
  const station = randomUUID(), user = randomUUID(), session = randomUUID();
  // Committed unique fixtures: all twenty independent backend processes can see them.
  await admin`INSERT INTO public.stations(id,naam_msr) VALUES(${station},'Isolated phase2')`;
  await admin`INSERT INTO auth.sessions(id,user_id) VALUES(${session},${user})`;
  await admin`INSERT INTO public.user_roles(user_id,role) VALUES(${user},'admin')`;
  await role(connections[0],"service_role");
  await connections[0]`SELECT public.beheer_toestaan(${session},${user})`;
  try { await fn(station,user,session); }
  finally {
    const cases = await admin`SELECT station_id FROM public.case_aanvragen WHERE user_id=${user}`;
    const ids = [station,...cases.map(c => c.station_id)];
    await admin`DELETE FROM public.case_aanvragen WHERE user_id=${user}`;
    await admin`DELETE FROM public.to_rondes WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.fotos WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.categorie_skips WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM storage.objects WHERE split_part(name,'/',2)=ANY(${ids}::text[])`;
    await admin`DELETE FROM public.opleverruns WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.rapport_pdf WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.station_verwerking WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.stations WHERE id IN ${admin(ids)}`;
    await admin`DELETE FROM public.beheer_sessies WHERE user_id=${user}`;
    await admin`DELETE FROM public.user_roles WHERE user_id=${user}`;
    await admin`DELETE FROM auth.sessions WHERE user_id=${user}`;
    await Promise.all(connections.map(c => c.unsafe("RESET ROLE")));
  }
}
describe.skipIf(!socket)("phase2 real PostgreSQL concurrency, twenty independent connections", () => {
  it("twenty simultaneous reservations share one run and snapshot; manual/weekly cannot claim it", () => fixture(async station => {
    await admin`INSERT INTO public.categorie_skips(station_id,categorie,reden) SELECT ${station},naam,'Isolated NVT' FROM public.vereiste_fotocategorieen((SELECT s FROM public.stations s WHERE id=${station}))`;
    await Promise.all(connections.map(c => role(c,"anon")));
    const replies = await concurrent(async c => (await c`SELECT public.fotodossier_aanbieden(${station}) AS r`)[0].r);
    expect(new Set(replies.map(r => r.id)).size).toBe(1);
    expect(replies.filter(r => r.nieuw).length).toBe(1);
    const run = replies[0].id;
    expect((await admin`SELECT dossier FROM public.opleverruns WHERE id=${run}`)[0].dossier.station.status).toBe("opgeleverd");
    await Promise.all(connections.map(c => role(c,"service_role")));
    expect((await connections[0]`SELECT public.station_claim(${station},${randomUUID()},NULL) AS g`)[0].g).toBeNull();
    const owners = connections.map(() => randomUUID());
    const claims = await concurrent(async (c,i) => (await c`SELECT public.station_claim(${station},${owners[i]},${run}) AS g`)[0].g);
    expect(claims.filter(g => g != null)).toHaveLength(1);
    // Winner remains committed and held while every loser is checked.
    expect((await admin`SELECT eigenaar FROM public.station_verwerking WHERE station_id=${station}`)[0].eigenaar).toBe(owners[claims.findIndex(g => g != null)]);
  }));
  it("generation fences expired workers, conditional promotion retains last good PDF on new failure", () => fixture(async station => {
    const run = (await admin`INSERT INTO public.opleverruns(station_id) VALUES(${station}) RETURNING id`)[0].id;
    await admin`INSERT INTO public.rapport_pdf(station_id,status,pdf_pad,pdf_hash) VALUES(${station},'klaar','legacy-good.pdf','good')`;
    const a = randomUUID(), b = randomUUID();
    await role(connections[0],"service_role"); await role(connections[1],"service_role");
    const old = (await connections[0]`SELECT public.station_claim(${station},${a},${run}) AS g`)[0].g;
    await admin`UPDATE public.station_verwerking SET geldig_tot=clock_timestamp()-interval '1 second' WHERE station_id=${station}`;
    const next = (await connections[1]`SELECT public.station_claim(${station},${b},${run}) AS g`)[0].g;
    expect(Number(next)).toBe(Number(old)+1);
    expect((await connections[0]`SELECT public.station_claim_check(${station},${a},${old}) AS ok`)[0].ok).toBe(false);
    expect((await connections[0]`SELECT public.verwerking_opslaan(${station},${a},${old},${run},${connections[0].json({ status: "afgerond" })}::jsonb,${connections[0].json({ status: "klaar", pdf_pad: "stale.pdf" })}::jsonb) AS ok`)[0].ok).toBe(false);
    expect((await connections[1]`SELECT public.verwerking_opslaan(${station},${b},${next},${run},NULL,${connections[1].json({ status: "mislukt", fout: "missing photo" })}::jsonb) AS ok`)[0].ok).toBe(true);
    const pointer = (await admin`SELECT status,pdf_pad FROM public.rapport_pdf WHERE station_id=${station}`)[0];
    expect(pointer).toEqual({ status: "mislukt", pdf_pad: "legacy-good.pdf" });
  }));
  it("same request replay survives lost response; modified payload and another user are denied", () => fixture(async (_station,user,session) => {
    await role(connections[0],"authenticated",user,session);
    const request = randomUUID();
    const payload = { casenummer: randomUUID(), casenaam: "Replay", ronde: 3, toStatus: "goedgekeurd", ingediendOp: null };
    const first = (await connections[0]`SELECT public.case_aanmaken(${request},${connections[0].json(payload)}::jsonb) AS r`)[0].r;
    const replay = (await connections[0]`SELECT public.case_aanmaken(${request},${connections[0].json(payload)}::jsonb) AS r`)[0].r;
    expect(first.uitkomst).toBe("aangemaakt"); expect(replay).toEqual({ id: first.id, uitkomst: "replay" });
    const rounds = await admin`SELECT nummer,status,ingediend_op FROM public.to_rondes WHERE station_id=${first.id} ORDER BY nummer`;
    expect(rounds.map(r => [r.nummer,r.status,r.ingediend_op])).toEqual([[1,"afgekeurd",null],[2,"afgekeurd",null],[3,"goedgekeurd",null]]);
    await expect(connections[0]`SELECT public.case_aanmaken(${request},${connections[0].json({ ...payload, casenaam: "Changed" })}::jsonb)`).rejects.toMatchObject({ code: "22023" });
    const otherUser = randomUUID(), otherSession = randomUUID();
    await admin`INSERT INTO auth.sessions(id,user_id) VALUES(${otherSession},${otherUser})`;
    await admin`INSERT INTO public.user_roles(user_id,role) VALUES(${otherUser},'admin')`;
    await role(connections[1],"service_role"); await connections[1]`SELECT public.beheer_toestaan(${otherSession},${otherUser})`;
    await role(connections[1],"authenticated",otherUser,otherSession);
    try {
      await expect(connections[1]`SELECT public.case_aanmaken(${request},${connections[1].json(payload)}::jsonb)`).rejects.toMatchObject({ code: "22023" });
      expect((await connections[1]`SELECT public.case_aanmaken(${randomUUID()},${connections[1].json(payload)}::jsonb) AS r`)[0].r).toEqual({ uitkomst: "bestaat" });
    } finally {
      await admin`DELETE FROM public.beheer_sessies WHERE user_id=${otherUser}`; await admin`DELETE FROM auth.sessions WHERE user_id=${otherUser}`; await admin`DELETE FROM public.user_roles WHERE user_id=${otherUser}`;
    }
  }));
  it("twenty distinct requests for one number create only one case; bad row reserves nothing", () => fixture(async (_station,user,session) => {
    await Promise.all(connections.map(c => role(c,"authenticated",user,session)));
    const nr = randomUUID(), request = randomUUID();
    await expect(connections[0]`SELECT public.case_aanmaken(${request},${connections[0].json({ casenummer: nr, casenaam: "" })}::jsonb)`).rejects.toMatchObject({ code: "22023" });
    const results = await concurrent(async c => (await c`SELECT public.case_aanmaken(${randomUUID()},${c.json({ casenummer: nr, casenaam: "Valid" })}::jsonb) AS r`)[0].r);
    expect(results.filter(r => r.uitkomst === "aangemaakt")).toHaveLength(1);
    expect(results.filter(r => r.uitkomst === "bestaat")).toHaveLength(19);
  }));
  it("twenty old case-wait/retry runs do not block runnable work; case update wakes it without UI", () => fixture(async station => {
    const ids: string[] = [];
    try {
      for (let i=0;i<20;i++) {
        const sid = randomUUID(); ids.push(sid);
        await admin`INSERT INTO public.stations(id,naam_msr) VALUES(${sid},'Waiting fixture')`;
        await admin`INSERT INTO public.opleverruns(station_id,status,gestart_op,volgende_poging_op) VALUES(${sid},${i%2 ? "wacht_op_retry" : "wacht_op_casegegevens"},clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day')`;
      }
      const ready = (await admin`INSERT INTO public.opleverruns(station_id) VALUES(${station}) RETURNING id`)[0].id;
      await role(connections[0],"service_role");
      expect((await connections[0]`SELECT id FROM public.uitvoerbare_opleverruns(NULL,20)`).map(r => r.id)).toContain(ready);
      await admin`UPDATE public.stations SET casenummer='ready',casenaam='Ready' WHERE id=${ids[0]}`;
      expect((await connections[0]`SELECT station_id FROM public.uitvoerbare_opleverruns(NULL,20)`).map(r => r.station_id)).toContain(ids[0]);
      expect((await connections[0]`SELECT public.opleverrun_retry(${randomUUID()}) AS ok`)[0].ok).toBe(false);
    } finally { await admin`DELETE FROM public.opleverruns WHERE station_id IN ${admin(ids)}`; await admin`DELETE FROM public.stations WHERE id IN ${admin(ids)}`; }
  }));
  it("duplicate upload/registration through the real service and local storage adapter is idempotent", () => fixture(async station => {
    const c = connections[0]; await role(c,"anon");
    const pad = `stations/${station}/test/q_local.jpg`;
    const adapter = {
      storage: { from: () => ({
        upload: async (name: string) => { try { await c`INSERT INTO storage.objects(bucket_id,name) VALUES('to-fotos',${name})`; return { error: null }; } catch(e) { return { error: { message: "duplicate", statusCode: (e as { code: string }).code === "23505" ? "409" : "403" } }; } },
        getPublicUrl: (name: string) => ({ data: { publicUrl: `https://aiwpseouqechfsvagxkc.supabase.co/storage/v1/object/public/to-fotos/${name}` } }),
        remove: async () => ({ error: { message: "Not allowed" } }),
      }) },
      from: () => ({
        select: () => ({ eq: (_: string,path: string) => ({ limit: async () => ({ data: await c`SELECT id FROM public.fotos WHERE storage_path=${path}`, error: null }) }) }),
        insert: async (r: Record<string,unknown>) => { try { await c`INSERT INTO public.fotos ${c(r,"station_id","categorie","storage_path","url","volgorde")}`; return { error: null }; } catch(e) { return { error: { message: String(e) } }; } },
      }),
    };
    const reg = { stationId: station, categorie: "Test", volgorde: 1 };
    expect((await uploadEnRegistreer(pad,new Blob(["fixture"]),reg,adapter)).ok).toBe(true);
    expect(await uploadEnRegistreer(pad,new Blob(["fixture"]),reg,adapter)).toMatchObject({ ok: true, al: true });
    expect((await admin`SELECT id FROM storage.objects WHERE bucket_id='to-fotos' AND name=${pad}`).length).toBe(1);
    expect((await admin`SELECT id FROM public.fotos WHERE storage_path=${pad}`).length).toBe(1);
  }));
});
afterAll(async () => { await Promise.all([admin.end(),...connections.map(c => c.end())]); });