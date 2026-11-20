// PBKDF2-controle van de pincode tegen de opgeslagen hash ("pbkdf2$iter$salt$hash", base64).
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function pinKlopt(pin: string, opgeslagen: string): Promise<boolean> {
  const [alg, iter, salt, hash] = opgeslagen.split("$");
  if (alg !== "pbkdf2" || !iter || !salt || !hash) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(salt), iterations: Number(iter) }, key, 256));
  const verwacht = b64(hash);
  if (bits.length !== verwacht.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ verwacht[i];
  return diff === 0;
}

export const MAX_FOUT = 8;          // per kwartier per apparaat/ip
export const VENSTER_MIN = 15;
export const MAX_FOUT_GLOBAAL = 60; // per kwartier voor alle aanroepers samen
