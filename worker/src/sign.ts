// Ed25519 signing via WebCrypto (supported natively in workerd).
import { canonicalize } from "./envelope";

export async function importPrivateKey(jwkJson: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkJson) as JsonWebKey;
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.d) {
    throw new Error("SIGNING_KEY must be an Ed25519 private JWK");
  }
  return crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
}

export function publicJwk(privateJwkJson: string): JsonWebKey {
  const jwk = JSON.parse(privateJwkJson) as JsonWebKey;
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
}

export async function signEnvelope(key: CryptoKey, envelopeSansSig: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalize(envelopeSansSig));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, data));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}
