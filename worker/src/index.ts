// Routes: /stream /ingest /events /pubkey /health — all served by the Ledger DO.
import { Ledger, type Env } from "./ledger.ts";
import { FEEDS, due } from "./feeds/index.ts";

export { Ledger };

const ROUTES = new Set(["/ingest", "/stream", "/events", "/pubkey", "/health"]);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!ROUTES.has(url.pathname)) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/ingest") {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
      }
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${env.INGEST_TOKEN}`) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      }
    }
    const stub = env.LEDGER.get(env.LEDGER.idFromName("ledger"));
    return stub.fetch(req);
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const stub = env.LEDGER.get(env.LEDGER.idFromName("ledger"));
    const force = controller.cron === "__all__"; // smoke/dev: run every feed regardless of cadence
    for (const feed of FEEDS) {
      if (!force && !due(feed, controller.scheduledTime)) continue;
      const counts = { feed: feed.name, fetched: 0, new: 0, dup: 0, error: 0 };
      let error: string | null = null;
      try {
        const events = await feed.fetch();
        for (const event of events) {
          counts.fetched++;
          const res = await stub.fetch(
            new Request("https://ledger/ingest", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(event),
            }),
          );
          if (res.status === 202) counts.new++;
          else if (res.status === 409) counts.dup++;
          else {
            counts.error++;
            console.error(`${feed.name} ingest error (${res.status}): ${await res.text()}`);
          }
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        console.error(`${feed.name} feed failed: ${error}`);
        counts.error++;
      }
      console.log(JSON.stringify(counts));
      await stub.fetch(
        new Request("https://ledger/feeds/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: feed.name, every_minutes: feed.everyMinutes, ok: error === null, error,
            fetched: counts.fetched, new: counts.new, dup: counts.dup,
          }),
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
