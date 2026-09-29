// Feed registry. Each feed: pure normalizer + fetch, polled by scheduled() on its own cadence.
import type { IngestBody } from "../envelope.ts";
import { fetchUsgs } from "./usgs.ts";
import { fetchSwpc } from "./swpc.ts";
import { fetchLl2 } from "./ll2.ts";
import { fetchCneos } from "./cneos.ts";
import { fetchGracedb } from "./gracedb.ts";

export interface Feed {
  name: string; // == IngestBody.source
  everyMinutes: number; // cadence; cron fires every minute, feed runs when minute % everyMinutes == 0
  fetch: (fetchFn?: typeof fetch) => Promise<IngestBody[]>;
}

export const USER_AGENT = "planetlog/0.0.1 (+https://github.com/ejoliet/planetlog)";

export const FEEDS: Feed[] = [
  { name: "usgs", everyMinutes: 1, fetch: fetchUsgs },
  { name: "swpc", everyMinutes: 5, fetch: fetchSwpc },
  { name: "gracedb", everyMinutes: 5, fetch: fetchGracedb },
  { name: "ll2", everyMinutes: 10, fetch: fetchLl2 }, // free tier ~15 req/h
  { name: "cneos", everyMinutes: 60, fetch: (f) => fetchCneos(f) },
];

export function due(feed: Feed, scheduledTime: number): boolean {
  return Math.floor(scheduledTime / 60_000) % feed.everyMinutes === 0;
}
