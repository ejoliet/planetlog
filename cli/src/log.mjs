// planet log — hot-window query via /events (R2 archive read is post-spike).
import { emit } from "./format.mjs";

export async function log(args) {
  const qs = new URLSearchParams();
  if (args.types) qs.set("types", args.types);
  if (args.since) qs.set("since", args.since);
  if (args.limit) qs.set("limit", args.limit);
  const res = await fetch(`${args.url}/events${qs.size ? "?" + qs : ""}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { events } = await res.json();
  for (const ev of events.reverse()) emit(ev, args.json === true);
}
