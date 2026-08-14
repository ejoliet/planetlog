// Routes: /stream /ingest /events /pubkey /health — all served by the Ledger DO.
import { Ledger, type Env } from "./ledger";

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
} satisfies ExportedHandler<Env>;
