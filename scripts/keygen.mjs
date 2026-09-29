#!/usr/bin/env node
// Generate a dev Ed25519 signing key + ingest token into worker/.dev.vars.
// `--stdout` prints both to stdout instead (for `wrangler secret put` in production).
// Ship-check rule: dev-only file, gitignored, never committed.
import { writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "worker", ".dev.vars");

const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const exported = await crypto.subtle.exportKey("jwk", kp.privateKey);
// Node stamps alg:"Ed25519"; workerd rejects any alg other than "EdDSA" on
// import — keep only the JWK members the key actually needs.
const priv = { kty: exported.kty, crv: exported.crv, x: exported.x, d: exported.d };
const stdout = process.argv.includes("--stdout");
const token = `${stdout ? "plt" : "dev"}-${randomBytes(16).toString("hex")}`;

if (stdout) {
  console.log(`SIGNING_KEY=${JSON.stringify(priv)}`);
  console.log(`INGEST_TOKEN=${token}`);
} else {
  await writeFile(target, `SIGNING_KEY=${JSON.stringify(priv)}\nINGEST_TOKEN=${token}\n`);
  console.log(`wrote ${target}`);
  console.log(`INGEST_TOKEN=${token}`);
}
