# planetlog

**The Planetary Changelog** — tail everything happening to the planet (and the sky above it), live, from your terminal.

```
17:04:22 quake          M6.2   M 6.2 - 40 km SW of Antofagasta, Chile  usgs
```

This is a **spike** (`0.0.1-spike`): a minimal end-to-end slice proving the core loop — a signed, append-only event ledger with a live SSE tail and offline signature verification.

## What it proves

1. A fixture event (USGS quake) POSTed to `/ingest` appears on a live `planet tail` in under 2 seconds.
2. Duplicate ingests are rejected with `409` and never re-broadcast (dedupe by `source` + `upstream_id`).
3. Every event is Ed25519-signed by the server; `planet verify` validates the signature offline against `/pubkey`.

## Architecture

```
producer ──POST /ingest──▶ Cloudflare Worker ──▶ Ledger (Durable Object, SQLite)
                                                   │  assigns ULID, signs envelope,
                                                   │  persists, broadcasts
clients ◀──SSE /stream── live tail                 │
clients ◀──GET /events── backfill / history ◀──────┘
```

- **worker/** — Cloudflare Worker + `Ledger` Durable Object (SQLite-backed). Routes: `/ingest` (auth'd POST), `/stream` (SSE), `/events` (history), `/pubkey`, `/health`.
- **cli/** — `planet` CLI, zero runtime deps, Node ≥ 20: `tail` (SSE), `log` (history), `verify` (Ed25519 + JCS canonicalization, RFC 8785).
- **schema/** — JSON Schema for the v1 event envelope. Event types: `quake`, `space_weather`, `launch`, `close_approach`, `grb`, `gw`, `neutrino`. Every event carries `geo` (lat/lon) or `sky` (ra/dec) coordinates and the raw upstream payload verbatim.
- **fixtures/** — sample USGS quake used by the smoke test.
- **scripts/** — dev keygen and the end-to-end smoke test.

Signature scheme: the server signs `JCS(envelope minus sig)` with an Ed25519 key; the signature is base64 in `sig`. Anyone can re-canonicalize and verify against the public key — no trust in the transport required.

## Quick start

Requires Node ≥ 20 (bundled npm/npx). No global installs needed.

```bash
# 1. Generate a dev signing key + ingest token (writes worker/.dev.vars, gitignored)
make keygen

# 2. Start the worker locally (http://127.0.0.1:8787)
make dev

# 3. In another terminal: tail the planet
node cli/src/main.mjs tail --url http://127.0.0.1:8787

# 4. Ingest the fixture quake (token printed by keygen, also in worker/.dev.vars)
curl -X POST http://127.0.0.1:8787/ingest \
  -H "authorization: Bearer $INGEST_TOKEN" \
  -H "content-type: application/json" \
  --data @fixtures/usgs-quake.json
```

The quake appears on your tail within ~2 s, signed.

### CLI

```
planet tail   [--types quake,grb] [--min-mag 5] [--since <ulid>] [--json] [--url <base>]
planet log    [--types launch] [--limit 100] [--json] [--url <base>]
planet verify <event.json> [--url <base>]
```

Base URL resolution: `--url` flag > `PLANETLOG_URL` env > `https://api.planetlog.dev`.

### Make targets

```bash
make keygen      # dev Ed25519 key + INGEST_TOKEN -> worker/.dev.vars
make dev         # wrangler dev on :8787
make typecheck   # tsc --noEmit on the worker
make smoke       # full end-to-end acceptance test (see below)
```

## Smoke test

```bash
make smoke            # uses port 8787
PORT=8899 make smoke  # if 8787 is busy
```

Boots the worker, starts a JSON tail, then asserts: ingest → `202` with ULID; event on the tail < 2 s; duplicate → `409` and not re-broadcast; missing token → `401`; `planet verify` passes against `/pubkey`. Prints `SMOKE PASS` on success. Each run uses a unique `upstream_id` so the persisted dedupe in `.wrangler/state` doesn't trip re-runs.

## Secrets

`worker/.dev.vars` holds the dev signing key and ingest token — gitignored, never committed. For a real deploy, set `SIGNING_KEY` and `INGEST_TOKEN` via `wrangler secret put`.

## Spike scope / non-goals

- No real upstream pollers yet (USGS/NASA/GCN) — ingest is manual/fixture-driven.
- Single hardcoded Ledger DO instance; no sharding, retention, or pagination.
- One static ingest token; no key rotation.

## License

MIT
