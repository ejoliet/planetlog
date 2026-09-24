// Durable Object: append-only changelog (DO SQLite) · revisions per upstream event · ULID · sign · SSE fan-out.
import { validateIngest, canonicalize, fingerprint, type Envelope, type IngestBody } from "./envelope";
import { importPrivateKey, publicJwk, signEnvelope } from "./sign";
import { ulid } from "./ulid";

export interface Env {
  LEDGER: DurableObjectNamespace;
  INGEST_TOKEN: string;
  SIGNING_KEY: string;
}

interface SseClient {
  controller: ReadableStreamDefaultController<Uint8Array>;
  types: Set<string> | null;
  minMag: number | null;
  keepalive: ReturnType<typeof setInterval> | null;
}

const REPLAY_LIMIT = 1000;
const KEEPALIVE_MS = 20_000;
const enc = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CREATE_EVENTS = `CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  upstream_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  supersedes TEXT,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  time TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  magnitude REAL,
  body TEXT NOT NULL,
  UNIQUE (source, upstream_id, revision)
)`;

export class Ledger {
  private readonly sql: SqlStorage;
  private readonly key: Promise<CryptoKey>;
  private readonly clients = new Set<SseClient>();

  constructor(ctx: DurableObjectState, private readonly env: Env) {
    this.sql = ctx.storage.sql;
    this.sql.exec(CREATE_EVENTS);
    // Spike-era dev state (pre-revision schema, never deployed) is disposable: drop and recreate.
    const cols = this.sql.exec("PRAGMA table_info(events)").toArray();
    if (!cols.some((c) => c.name === "revision")) {
      this.sql.exec("DROP TABLE events");
      this.sql.exec(CREATE_EVENTS);
    }
    this.sql.exec("CREATE INDEX IF NOT EXISTS events_type_id ON events(type, id)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS events_time ON events(time, id)");
    this.key = importPrivateKey(env.SIGNING_KEY);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    switch (url.pathname) {
      case "/ingest":
        return this.ingest(req);
      case "/stream":
        return this.stream(url);
      case "/events":
        return this.events(url);
      case "/pubkey":
        return json(publicJwk(this.env.SIGNING_KEY));
      case "/health":
        return this.health();
      default:
        return json({ error: "not found" }, 404);
    }
  }

  private async ingest(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const err = validateIngest(body);
    if (err) return json({ error: err }, 400);
    const ev = body as IngestBody;
    const fp = fingerprint(ev);

    const prev = this.sql
      .exec(
        "SELECT id, revision, fingerprint, magnitude FROM events WHERE source = ? AND upstream_id = ? ORDER BY revision DESC LIMIT 1",
        ev.source,
        ev.upstream_id,
      )
      .toArray()[0];
    if (prev && prev.fingerprint === fp) return json({ error: "duplicate", id: prev.id }, 409);

    const now = Date.now();
    const envelope: Envelope = {
      ...ev,
      id: ulid(now),
      schema: "planetlog/v1",
      ingested_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
      revision: prev ? Number(prev.revision) + 1 : 1,
      supersedes: prev ? String(prev.id) : null,
      prev_magnitude: prev ? (prev.magnitude as number | null) : null,
    };
    envelope.sig = await signEnvelope(await this.key, { ...envelope, sig: undefined });

    this.sql.exec(
      "INSERT INTO events (id, source, upstream_id, revision, supersedes, fingerprint, type, time, ingested_at, magnitude, body) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      envelope.id,
      envelope.source,
      envelope.upstream_id,
      envelope.revision,
      envelope.supersedes,
      fp,
      envelope.type,
      envelope.time,
      envelope.ingested_at,
      envelope.magnitude ?? null,
      canonicalize(envelope),
    );

    this.broadcast(envelope);
    return json({ id: envelope.id, revision: envelope.revision, supersedes: envelope.supersedes }, 202);
  }

  private broadcast(envelope: Envelope): void {
    const frame = enc.encode(
      `id: ${envelope.id}\nevent: ${envelope.type}\ndata: ${JSON.stringify(envelope)}\n\n`,
    );
    for (const client of this.clients) {
      if (!matches(envelope.type, envelope.magnitude ?? null, client)) continue;
      try {
        client.controller.enqueue(frame);
      } catch {
        this.drop(client); // client gone
      }
    }
  }

  private drop(client: SseClient): void {
    if (client.keepalive !== null) clearInterval(client.keepalive);
    client.keepalive = null;
    this.clients.delete(client);
  }

  private stream(url: URL): Response {
    const typesParam = url.searchParams.get("types");
    const minMagParam = url.searchParams.get("min_mag");
    const since = url.searchParams.get("since");
    const client: SseClient = {
      controller: undefined as unknown as ReadableStreamDefaultController<Uint8Array>,
      types: typesParam ? new Set(typesParam.split(",")) : null,
      minMag: minMagParam !== null ? Number(minMagParam) : null,
      keepalive: null,
    };
    const clients = this.clients;
    const sql = this.sql;
    const drop = (): void => this.drop(client);

    const body = new ReadableStream<Uint8Array>({
      start(controller): void {
        client.controller = controller;
        controller.enqueue(enc.encode(": planetlog connected\n\nretry: 2000\n\n"));
        if (since) {
          const rows = sql
            .exec("SELECT body, type, magnitude FROM events WHERE id > ? ORDER BY id LIMIT ?", since, REPLAY_LIMIT)
            .toArray();
          for (const row of rows) {
            if (!matches(String(row.type), row.magnitude as number | null, client)) continue;
            const ev = JSON.parse(String(row.body)) as Envelope;
            controller.enqueue(enc.encode(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${row.body}\n\n`));
          }
        }
        // Cloudflare/proxies drop idle streams; comment frames keep them open.
        client.keepalive = setInterval(() => {
          try {
            controller.enqueue(enc.encode(": ping\n\n"));
          } catch {
            drop();
          }
        }, KEEPALIVE_MS);
        clients.add(client);
      },
      cancel(): void {
        drop();
      },
    });

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "access-control-allow-origin": "*",
      },
    });
  }

  private events(url: URL): Response {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");
    const typesParam = url.searchParams.get("types");
    const all = url.searchParams.get("all") === "1";
    const minMagParam = url.searchParams.get("min_mag");

    let query = "SELECT body FROM events WHERE 1=1";
    const binds: (string | number)[] = [];
    if (since) {
      query += " AND id > ?";
      binds.push(since);
    }
    if (until) {
      query += " AND id < ?";
      binds.push(until);
    }
    if (typesParam) {
      const types = typesParam.split(",");
      query += ` AND type IN (${types.map(() => "?").join(",")})`;
      binds.push(...types);
    }
    if (minMagParam !== null) {
      // Only magnitude-bearing events are filtered; events without a magnitude pass.
      query += " AND (magnitude IS NULL OR magnitude >= ?)";
      binds.push(Number(minMagParam));
    }
    if (!all) {
      // Latest revision per (source, upstream_id) only.
      query +=
        " AND NOT EXISTS (SELECT 1 FROM events e2 WHERE e2.source = events.source AND e2.upstream_id = events.upstream_id AND e2.revision > events.revision)";
    }
    query += " ORDER BY time DESC, id DESC LIMIT ?";
    binds.push(limit);

    const rows = this.sql.exec(query, ...binds).toArray();
    const events = rows.map((r) => JSON.parse(String(r.body)) as Envelope);
    return json({ events, count: events.length });
  }

  private health(): Response {
    const rows = this.sql
      .exec("SELECT source, MAX(ingested_at) AS last_ingest, COUNT(*) AS count FROM events GROUP BY source")
      .toArray();
    const feeds: Record<string, { last_ingest: string; count: number }> = {};
    for (const r of rows) {
      feeds[String(r.source)] = {
        last_ingest: String(r.last_ingest),
        count: Number(r.count),
      };
    }
    return json({ ok: true, sse_clients: this.clients.size, feeds });
  }
}

function matches(type: string, magnitude: number | null, client: SseClient): boolean {
  if (client.types && !client.types.has(type)) return false;
  // min_mag filters magnitude-bearing events only; launches/GRBs without one still pass.
  if (client.minMag !== null && magnitude !== null && magnitude < client.minMag) return false;
  return true;
}
