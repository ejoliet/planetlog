import { validateIngest, type IngestBody } from "../envelope.ts";

const LL2_FEED_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20&mode=normal";

// Map a Space Devs Launch to IngestBody.
// Returns null if required fields are missing or geo coordinates are invalid.
export function normalizeLl2Launch(launch: unknown): IngestBody | null {
  if (typeof launch !== "object" || launch === null) return null;

  const l = launch as Record<string, unknown>;

  // Validate required fields
  const id = l.id;
  const name = l.name;
  const net = l.net;
  const url = l.url;
  const status = l.status as Record<string, unknown> | undefined;
  const pad = l.pad as Record<string, unknown> | undefined;

  if (typeof id !== "string" || !id) return null;
  if (typeof name !== "string" || !name) return null;
  if (typeof net !== "string" || !net) return null;
  if (typeof url !== "string" || !url) return null;
  if (status == null || typeof status.abbrev === undefined && typeof status.name !== "string") return null;

  // Extract and validate pad coordinates
  if (pad == null) return null;
  const padLat = pad.latitude;
  const padLon = pad.longitude;

  // Handle both string and number coordinates
  const lat = typeof padLat === "string" ? Number(padLat) : typeof padLat === "number" ? padLat : NaN;
  const lon = typeof padLon === "string" ? Number(padLon) : typeof padLon === "number" ? padLon : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Build title: "${name} — ${status.abbrev ?? status.name}"
  const abbrev = typeof status.abbrev === "string" ? status.abbrev : null;
  const statusName = typeof status.name === "string" ? status.name : "Unknown";
  const statusDisplay = abbrev ?? statusName;
  // TBD = no real date yet (net is a placeholder midnight); it would flood the changelog. Skip until it firms up.
  if (statusDisplay === "TBD") return null;
  const title = `${name} — ${statusDisplay}`;

  // Strip milliseconds from ISO string for consistency
  const time = new Date(net).toISOString().replace(/\.\d{3}Z$/, "Z");

  const body: IngestBody = {
    type: "launch",
    time,
    source: "ll2",
    upstream_id: id,
    upstream_url: url,
    title,
    magnitude: null,
    mag_kind: null,
    geo: {
      lat,
      lon,
      depth_km: null,
    },
    sky: null,
    payload: launch,
  };

  // Validate before returning
  const error = validateIngest(body);
  if (error) return null;

  return body;
}

// Map a LL2 API response page to an array of IngestBody, dropping nulls.
export function normalizeLl2Feed(page: unknown): IngestBody[] {
  if (typeof page !== "object" || page === null) return [];

  const p = page as Record<string, unknown>;
  const results = p.results;

  if (!Array.isArray(results)) return [];

  return results
    .map((launch) => normalizeLl2Launch(launch))
    .filter((body): body is IngestBody => body !== null);
}

// Fetch the LL2 upcoming launches feed and return normalized IngestBody array.
export async function fetchLl2(fetchFn: typeof fetch = fetch): Promise<IngestBody[]> {
  const response = await fetchFn(LL2_FEED_URL, {
    headers: {
      "user-agent": "planetlog/0.0.1 (+https://github.com/ejoliet/planetlog)",
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(`LL2 feed fetch failed with status 429 (rate limited)`);
    }
    throw new Error(`LL2 feed fetch failed with status ${response.status}`);
  }

  const json = await response.json();
  return normalizeLl2Feed(json);
}
