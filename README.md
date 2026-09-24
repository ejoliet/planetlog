# planetlog

**The Planetary Changelog** — tail everything happening to the planet (and the sky above it), live, from your terminal.

```
17:04:22 quake          M6.2   M 6.2 - 40 km SW of Antofagasta, Chile  usgs
```

A signed, append-only event ledger with a live SSE tail and offline signature verification. First real feed: USGS earthquakes, polled every minute by a cron trigger.

## What it does

1. A cron poller fetches the USGS `all_hour` GeoJSON feed every minute, normalizes each quake, and ingests it into the ledger.
2. Duplicate ingests are rejected with `409` and never re-broadcast (dedupe by `source` + `upstream_id` + material fingerprint).
3. When upstream revises an event (USGS bumps a magnitude), the ledger appends a new signed envelope with `revision: n+1` and `supersedes: <previous id>`. `/events` returns the latest revision only (`?all=1` for every revision); the tail shows each revision as it lands, rendered as a delta (`M6.2->M6.9`) when the magnitude changed, else a `rev2` marker.
4. Every event is Ed25519-signed by the server; `planet verify` validates the signature offline against `/pubkey`.
5. SSE stream sends a `: ping` every 20 s; `planet tail` reconnects with `since=<last id>` on drop, so nothing is missed.

## Architecture

```
USGS feed ──cron (1/min)──▶ scheduled() ──┐
producer ──POST /ingest──▶ Cloudflare Worker ──▶ Ledger (Durable Object, SQLite)
                                                   │  assigns ULID + revision, signs envelope,
                                                   │  persists (append-only), broadcasts
clients ◀──SSE /stream── live tail                 │
clients ◀──GET /events── backfill / history ◀──────┘
```

- **worker/** — Cloudflare Worker + `Ledger` Durable Object (SQLite-backed). Routes: `/ingest` (auth'd POST), `/stream` (SSE), `/events` (history), `/pubkey`, `/health`. `worker/src/feeds/usgs.ts` normalizes the USGS feed; `scheduled()` runs it on the cron trigger and posts straight to the DO (no bearer token on the internal path).
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

# 3. Put `planet` on your PATH (npm link, zero deps), point it at the local worker
make cli
export PLANETLOG_URL=http://127.0.0.1:8787

# 4. In another terminal: tail the planet
planet tail

# 5a. Pull real quakes now (wrangler dev does not fire crons; this triggers the handler)
curl 'http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*'

# 5b. Or ingest the fixture quake by hand (token printed by keygen, also in worker/.dev.vars)
curl -X POST http://127.0.0.1:8787/ingest \
  -H "authorization: Bearer $INGEST_TOKEN" \
  -H "content-type: application/json" \
  --data @fixtures/usgs-quake.json
```

The quake appears on your tail within ~2 s, signed.

### CLI

```
planet tail   [--types quake,grb] [--min-mag 5] [--since <ulid>] [--json] [--url <base>]
planet log    [--types launch] [--min-mag 5] [--limit 100] [--all] [--json] [--url <base>]
planet verify <event.json> [--url <base>]
```

Human output hides magnitude-bearing events below M2 by default (`--min-mag 0` shows everything; events without a magnitude, e.g. launches, always pass). `--json` is unfiltered. `log` prints newest event time first; `--all` includes superseded revisions.

Base URL resolution: `--url` flag > `PLANETLOG_URL` env > `https://api.planetlog.dev`.

### Make targets

```bash
make keygen      # dev Ed25519 key + INGEST_TOKEN -> worker/.dev.vars
make cli         # npm link -> `planet` on PATH (set PLANETLOG_URL for local dev)
make dev         # wrangler dev on :8787 (with --test-scheduled so /__scheduled works)
make typecheck   # tsc --noEmit on the worker
make test        # unit tests (USGS normalizer), node --test, no build step
make smoke       # full end-to-end acceptance test (see below)
```

## Smoke test

```bash
make smoke            # uses port 8787
PORT=8899 make smoke  # if 8787 is busy
```

Boots the worker, starts a JSON tail, then asserts: ingest → `202` with ULID; event on the tail < 2 s; duplicate → `409` and not re-broadcast; revised event → `202` with `revision: 2` and `supersedes`, `/events` shows latest only; missing token → `401`; `planet verify` passes on both revisions; the cron handler ingests real USGS events (skipped without network; `SMOKE_NET=1` makes it required). Prints `SMOKE PASS` on success. Each run uses a unique `upstream_id` so the persisted dedupe in `.wrangler/state` doesn't trip re-runs.

## Secrets

`worker/.dev.vars` holds the dev signing key and ingest token — gitignored, never committed. For a real deploy, set `SIGNING_KEY` and `INGEST_TOKEN` via `wrangler secret put`.

## Not yet

- Only USGS is polled. Next feeds: NOAA SWPC (space weather), Launch Library 2, JPL CNEOS close approaches, GraceDB (GW). GCN/IceCube need a Kafka consumer outside Workers.
- Not deployed: `api.planetlog.dev` is the CLI default but nothing answers there yet.
- Single Ledger DO instance; no sharding or pagination. SQLite schema migration is drop-and-recreate (fine until first deploy).
- One static ingest token; no key rotation.

## License

MIT
