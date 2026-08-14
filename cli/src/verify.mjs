// planet verify — check an event's Ed25519 signature against /pubkey.
import { readFile } from "node:fs/promises";
import { canonicalize } from "./jcs.mjs";

export async function verify(args) {
  const file = args._[0];
  if (!file) throw new Error("usage: planet verify <event.json>");
  const ev = JSON.parse(await readFile(file, "utf8"));
  if (!ev.sig) throw new Error("event has no sig field");

  const res = await fetch(`${args.url}/pubkey`);
  if (!res.ok) throw new Error(`pubkey fetch failed: HTTP ${res.status}`);
  const jwk = await res.json();

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
  const { sig, ...rest } = ev;
  const ok = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    Buffer.from(sig, "base64"),
    new TextEncoder().encode(canonicalize(rest)),
  );
  if (ok) {
    console.log(`OK  ${ev.id}  signature valid (${ev.type}: ${ev.title})`);
  } else {
    console.error(`FAIL  ${ev.id ?? "?"}  signature INVALID`);
    process.exit(1);
  }
}
