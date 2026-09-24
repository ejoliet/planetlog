// Routes: /stream /ingest /events /pubkey /health — all served by the Ledger DO.
import { Ledger, type Env } from "./ledger.ts";
import { fetchUsgs } from "./feeds/usgs.ts";

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

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    try {
      const events = await fetchUsgs();
      const stub = env.LEDGER.get(env.LEDGER.idFromName("ledger"));

      let fetched = 0;
      let newCount = 0;
      let dupCount = 0;
      let errorCount = 0;

      for (const event of events) {
        fetched++;
        const response = await stub.fetch(
          new Request("https://ledger/ingest", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(event),
          })
        );

        if (response.status === 202) {
          newCount++;
        } else if (response.status === 409) {
          dupCount++;
        } else {
          errorCount++;
          const body = await response.text();
          console.error(`ingest error (status ${response.status}): ${body}`);
        }
      }

      console.log(
        JSON.stringify({
          feed: "usgs",
          fetched,
          new: newCount,
          dup: dupCount,
          error: errorCount,
        })
      );
    } catch (err) {
      console.error(`scheduled USGS feed fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
} satisfies ExportedHandler<Env>;
