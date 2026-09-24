// planet tail — SSE over native fetch streaming, no deps.
import { emit, DEFAULT_MIN_MAG } from "./format.mjs";

export async function tail(args) {
  let lastId = args.since;
  let backoffSecs = 1;
  const maxBackoff = 30;
  let everConnected = false;
  const minMag = args["min-mag"] ?? (args.json ? undefined : DEFAULT_MIN_MAG);

  while (true) {
    let eventCount = 0;
    let frameId = null;
    const startTime = Date.now();

    try {
      const qs = new URLSearchParams();
      if (args.types) qs.set("types", args.types);
      if (minMag !== undefined) qs.set("min_mag", minMag);
      if (lastId) qs.set("since", lastId);
      const url = `${args.url}/stream${qs.size ? "?" + qs : ""}`;

      const res = await fetch(url, { headers: { accept: "text/event-stream" } });
      if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status}`);
      everConnected = true;
      if (!args.json) console.error(`connected to ${url}`);

      const decoder = new TextDecoder();
      let buf = "";

      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let sep;
        while ((sep = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);

          // Parse id: line (SSE frame identifier)
          const idMatch = frame.match(/^id: (.+)$/m);
          if (idMatch) frameId = idMatch[1];

          const data = frame
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (!data) continue; // comment/heartbeat frame

          const ev = JSON.parse(data);
          // Fall back to data.id if SSE frame lacked id: line
          if (!frameId && ev.id) frameId = ev.id;
          if (frameId) lastId = frameId;

          emit(ev, args.json === true);
          eventCount++;
        }
      }
      // Stream ended normally
    } catch (err) {
      // Check if it's a 4xx error (non-retryable)
      const match = err.message.match(/HTTP (\d+)/);
      if (match && match[1].startsWith("4")) {
        throw err;
      }
      // Never reached the server: bad URL, not deployed, or offline — fail loud, don't loop.
      if (!everConnected) {
        const why = err.cause?.code ?? err.cause?.message ?? err.message;
        throw new Error(`cannot reach ${args.url} (${why}) — pass --url or set PLANETLOG_URL`);
      }
      // Retryable error or stream close - will reconnect below
    }

    // Reset backoff if we got events or stayed connected > 10s
    if (eventCount > 0 || Date.now() - startTime > 10000) {
      backoffSecs = 1;
    }

    // Schedule reconnect
    const msg = `reconnecting in ${backoffSecs}s (last id ${lastId ?? "none"})`;
    if (!args.json) console.error(msg);
    await new Promise((r) => setTimeout(r, backoffSecs * 1000));
    backoffSecs = Math.min(backoffSecs * 2, maxBackoff);
  }
}
