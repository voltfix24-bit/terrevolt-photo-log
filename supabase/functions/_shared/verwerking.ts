// All mutating workers fence their database acknowledgement with the same claim.
export class Bezet extends Error { constructor() { super("Station wordt verwerkt; poging is uitgesteld"); } }
export class Claim {
  constructor(public db: any, public station: string, public eigenaar: string, public generatie: number, public run: string | null) {}
  aanvraagId: string | null = null;
  static async neem(db: any, station: string, run: string | null = null) {
    const eigenaar = crypto.randomUUID();
    const { data, error } = await db.rpc("station_claim", { _station_id: station, _eigenaar: eigenaar, _run: run, _seconden: 90 });
    if (error) throw error;
    if (data == null) throw new Bezet();
    const claim = new Claim(db, station, eigenaar, data, run);
    try {
      const { data: q, error: qe } = await db.rpc("verwerking_wachtrij_snapshot", claim.args());
      if (qe) throw qe;
      claim.aanvraagId = q?.aanvraag_id ?? null;
      return claim;
    } catch (e) { await claim.release().catch(() => {}); throw e; }
  }
  args() { return { _station_id: this.station, _eigenaar: this.eigenaar, _generatie: this.generatie }; }
  async check(vrijgeven = false) {
    const { data, error } = await this.db.rpc("station_claim_check", { ...this.args(), _vrijgeven: vrijgeven });
    if (error || data !== true) throw new Error("Verwerkingsclaim verlopen of overgenomen");
  }
  async save(run?: Record<string, unknown>, pdf?: Record<string, unknown>, sync?: Record<string, unknown>) {
    const { data, error } = await this.db.rpc("verwerking_opslaan", { ...this.args(), _run: this.run, _run_patch: run ?? null, _pdf_patch: pdf ?? null, _sync_patch: sync ?? null });
    if (error || data !== true) throw new Error("Verwerking niet bevestigd: claim of doelrij ontbreekt");
  }
  async snapshot() {
    if (!this.run) throw new Error("Geen rapportrevisie");
    const { data, error } = await this.db.rpc("verwerking_snapshot", { ...this.args(), _run: this.run });
    if (error || !data) throw new Error("Dossierkopie niet bevestigd");
    return data;
  }
  async queueDone(alleenStatus = false) {
    const { data,error } = await this.db.rpc("verwerking_wachtrij_klaar",{ ...this.args(), _aanvraag_id: this.aanvraagId, _alleen_status: alleenStatus });
    if (error || data !== true) throw new Error("Wachtrij niet bevestigd");
  }
  async release() { await this.check(true); }
}
export const revisiePad = (station: string, run: string, file: string) => `${station}/revisies/${run}/${file}`;
export async function hashBytes(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function exacteFotos(expected: { id: string; categorie: string }[], embedded: Iterable<string>) {
  const ids = new Set(embedded);
  const missing = expected.find(f => !ids.has(f.id));
  if (missing) throw new Error(`Foto ontbreekt/onleesbaar: ${missing.id} (${missing.categorie})`);
  if (ids.size !== expected.length || new Set(expected.map(f => f.id)).size !== expected.length) throw new Error("Fotoverzameling wijkt af van dossierkopie");
}
export function toetsDossier(d: any) {
  if (d.station?.uitvoerder !== "terrevolt") throw new Error("Geen TerreVolt-fotodossier");
  for (const c of d.vereisten ?? []) {
    const n = d.fotos.filter((f: any) => f.categorie === c.naam && f.review_status !== "rejected").length;
    if (n < c.minimum && !d.skips.some((s: any) => s.categorie === c.naam && s.reden?.trim())) throw new Error(`Fotodossier incompleet: ${c.naam}`);
  }
}
export async function immutableUpload(db: any, pad: string, bytes: Uint8Array, type: string, claim: Claim) {
  await claim.check();
  const { error } = await db.storage.from("rapporten").upload(pad, bytes, { upsert: false, contentType: type });
  if (!error) return;
  const { data } = await db.storage.from("rapporten").download(pad);
  if (!data || await hashBytes(new Uint8Array(await data.arrayBuffer())) !== await hashBytes(bytes)) throw new Error(`Rapportbestand niet bevestigd: ${pad}`);
}
export async function stelSyncUit(db: any, station: string, alleenStatus = false, fout = "Station bezet") {
  // A full sync dominates a queued status-only request.
  const { error } = await db.rpc("sharepoint_uitstellen", { _station_id: station, _alleen_status: alleenStatus, _fout: fout });
  if (error) throw error;
}