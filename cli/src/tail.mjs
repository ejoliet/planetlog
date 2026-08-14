// planet tail — SSE over native fetch streaming, no deps.
import { emit } from "./format.mjs";

export async function tail(args) {
  const qs = new URLSearchParams();
  if (args.types) qs.set("types", args.types);
  if (args["min-mag"]) qs.set("min_mag", args["min-mag"]);
  if (args.since) qs.set("since", args.since);
  const url = `${args.url}/stream${qs.size ? "?" + qs : ""}`;

  const res = await fetch(url, { headers: { accept: "text/event-stream" } });
  if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status}`);
  if (!args.json) console.error(`connected to ${url}`);

  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (!data) continue; // comment/heartbeat frame
      emit(JSON.parse(data), args.json === true);
    }
  }
  throw new Error("stream closed by server");
}
