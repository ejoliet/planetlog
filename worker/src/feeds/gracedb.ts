import { validateIngest, type IngestBody } from "../envelope.ts";
import { USER_AGENT } from "./index.ts";

const GRACEDB_FEED_URL =
  "https://gracedb.ligo.org/api/superevents/?query=category%3A%20Production&orderby=-created&count=20";

const GRACEDB_FALLBACK_URL = "https://gracedb.ligo.org/api/superevents/?count=20";

// AIDEV-NOTE: GPS epoch is 1980-01-06T00:00:00Z. Subtract 18 leap seconds
// (constant since 2017) to convert GPS time to UTC.
export function gpsToIso(gps: number): string {
  const GPS_EPOCH = new Date("1980-01-06T00:00:00Z").getTime();
  const LEAP_SECONDS = 18;
  const utcMs = GPS_EPOCH + (gps - LEAP_SECONDS) * 1000;
  return new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Render FAR (in Hz) as human-readable "1 per N years" string.
function farHumanReadable(far: number | null | undefined): string {
  if (far == null || far <= 0) return "unknown rate";
  const secondsPerYear = 31557600;
  const yearsPerEvent = 1 / (far * secondsPerYear);
  if (yearsPerEvent < 1e9) {
    return `1 per ${yearsPerEvent.toLocaleString("en-US", {
      maximumSignificantDigits: 2,
    })} years`;
  }
  return `1 per ${yearsPerEvent.toExponential(1)} years`;
}

// Map a GraceDB superevent to IngestBody.
// Returns null if superevent_id or t_0 is missing, or if it's a test/MDC superevent.
export function normalizeGracedbSuperevent(s: unknown): IngestBody | null {
  if (typeof s !== "object" || s === null) return null;

  const se = s as Record<string, unknown>;
  const superevent_id = se.superevent_id;
  const t_0 = se.t_0;
  const category = se.category;

  // Validate required fields
  if (typeof superevent_id !== "string") return null;
  if (typeof t_0 !== "number") return null;

  // Exclude test/MDC superevents: non-Production category or IDs starting with MS/TS
  if (category !== "Production") return null;
  if (superevent_id.startsWith("MS") || superevent_id.startsWith("TS")) return null;

  const time = gpsToIso(t_0);
  const far = se.far as number | undefined;
  const labels = se.labels as string[] | undefined;

  // Build title: superevent_id candidate, FAR rate, labels, retracted marker
  let titleParts = [`${superevent_id} candidate, FAR ${farHumanReadable(far)}`];

  if (labels && labels.length > 0) {
    titleParts.push(`[${labels.join(", ")}]`);
  }

  // Check for retracted status: labels containing ADVNO or the string "RETRACTED"
  const isRetracted =
    labels && (labels.some((l) => l.includes("ADVNO") || l.includes("RETRACTED")));
  if (isRetracted) {
    titleParts.push("RETRACTED");
  }

  const title = titleParts.join(" ");
  const upstream_url = `https://gracedb.ligo.org/superevents/${superevent_id}/view/`;

  const body: IngestBody = {
    type: "gw",
    time,
    source: "gracedb",
    upstream_id: superevent_id,
    upstream_url,
    title,
    magnitude: null,
    mag_kind: null,
    geo: null,
    sky: null,
    payload: se,
  };

  // Validate before returning
  const error = validateIngest(body);
  if (error) return null;

  return body;
}

// Map a superevents response to an array of IngestBody, dropping nulls.
export function normalizeGracedbFeed(resp: unknown): IngestBody[] {
  if (typeof resp !== "object" || resp === null) return [];

  const r = resp as Record<string, unknown>;
  const superevents = r.superevents;

  if (!Array.isArray(superevents)) return [];

  return superevents
    .map((se) => normalizeGracedbSuperevent(se))
    .filter((body): body is IngestBody => body !== null);
}

// Fetch the GraceDB feed and return normalized IngestBody array.
// Tries the query form first; falls back to basic count form on failure.
export async function fetchGracedb(fetchFn: typeof fetch = fetch): Promise<IngestBody[]> {
  let response = await fetchFn(GRACEDB_FEED_URL, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
  });

  // Fallback if query form fails
  if (!response.ok) {
    response = await fetchFn(GRACEDB_FALLBACK_URL, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
    });
  }

  if (!response.ok) {
    throw new Error(`GraceDB feed fetch failed with status ${response.status}`);
  }

  const json = await response.json();
  return normalizeGracedbFeed(json);
}
