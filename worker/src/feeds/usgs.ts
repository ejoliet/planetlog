import { validateIngest, type IngestBody } from "../envelope.ts";

export const USGS_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

// Map a USGS GeoJSON Feature to IngestBody.
// Returns null if geometry is not Point, id is missing, or time is missing.
export function normalizeUsgs(feature: unknown): IngestBody | null {
  if (typeof feature !== "object" || feature === null) return null;

  const f = feature as Record<string, unknown>;
  const props = f.properties as Record<string, unknown> | undefined;
  const geom = f.geometry as Record<string, unknown> | undefined;
  const id = f.id;

  // Validate required fields
  if (typeof id !== "string") return null;
  if (geom?.type !== "Point") return null;
  if (!Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return null;
  if (props == null || typeof props.time !== "number") return null;

  const coords = geom.coordinates as unknown[];
  const lon = coords[0];
  const lat = coords[1];
  const depth = coords[2];

  if (typeof lon !== "number" || typeof lat !== "number") return null;

  // AIDEV-NOTE: Strip milliseconds from ISO string for consistency.
  const time = new Date(props.time as number).toISOString().replace(/\.\d{3}Z$/, "Z");

  const mag = typeof props.mag === "number" ? props.mag : null;
  const magType = typeof props.magType === "string" ? props.magType : null;
  const place = typeof props.place === "string" ? props.place : "Unknown";
  const title = typeof props.title === "string" ? props.title : `M ${mag ?? "?"} - ${place}`;
  const url = typeof props.url === "string" ? props.url : null;

  const body: IngestBody = {
    type: "quake",
    time,
    source: "usgs",
    upstream_id: id,
    upstream_url: url,
    title,
    magnitude: mag,
    mag_kind: magType,
    geo: {
      lat,
      lon,
      depth_km: typeof depth === "number" ? depth : null,
    },
    sky: null,
    payload: feature,
  };

  // Validate before returning
  const error = validateIngest(body);
  if (error) return null;

  return body;
}

// Map a FeatureCollection to an array of IngestBody, dropping nulls.
export function normalizeUsgsFeed(collection: unknown): IngestBody[] {
  if (typeof collection !== "object" || collection === null) return [];

  const c = collection as Record<string, unknown>;
  const features = c.features;

  if (!Array.isArray(features)) return [];

  return features
    .map((f) => normalizeUsgs(f))
    .filter((body): body is IngestBody => body !== null);
}

// Fetch the USGS feed and return normalized IngestBody array.
export async function fetchUsgs(fetchFn: typeof fetch = fetch): Promise<IngestBody[]> {
  const response = await fetchFn(USGS_FEED_URL, {
    headers: {
      "user-agent": "planetlog/0.0.1 (+https://github.com/ejoliet/planetlog)",
    },
  });

  if (!response.ok) {
    throw new Error(`USGS feed fetch failed with status ${response.status}`);
  }

  const json = await response.json();
  return normalizeUsgsFeed(json);
}
