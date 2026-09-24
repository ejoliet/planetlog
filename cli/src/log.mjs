// planet log — history via /events, newest event time first (printed oldest -> newest).
import { emit, DEFAULT_MIN_MAG } from "./format.mjs";

export async function log(args) {
  const qs = new URLSearchParams();
  if (args.types) qs.set("types", args.types);
  if (args.since) qs.set("since", args.since);
  if (args.limit) qs.set("limit", args.limit);
  if (args.all) qs.set("all", "1");
  const minMag = args["min-mag"] ?? (args.json ? undefined : DEFAULT_MIN_MAG);
  if (minMag !== undefined) qs.set("min_mag", minMag);
  const res = await fetch(`${args.url}/events${qs.size ? "?" + qs : ""}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { events } = await res.json();
  for (const ev of events.reverse()) emit(ev, args.json === true);
}
