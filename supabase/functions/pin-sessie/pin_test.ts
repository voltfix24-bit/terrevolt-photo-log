import { assert, assertFalse } from "jsr:@std/assert@1";
import { pinKlopt } from "./pin.ts";

async function maak(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 1000 }, key, 256));
  const b = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return `pbkdf2$1000$${b(salt)}$${b(bits)}`;
}
Deno.test("juiste pin klopt", async () => assert(await pinKlopt("12345", await maak("12345"))));
Deno.test("verkeerde pin klopt niet", async () => assertFalse(await pinKlopt("12346", await maak("12345"))));
Deno.test("kapotte hash wordt afgewezen", async () => assertFalse(await pinKlopt("12345", "plain$12345")));
