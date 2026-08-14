// Envelope validation + JCS (RFC 8785) canonicalization.
// AIDEV-NOTE: hand-rolled JCS — JSON.stringify already serializes numbers per
// ECMAScript (which JCS references); the only extra work is recursive key sort.

export const EVENT_TYPES = [
  "quake",
  "space_weather",
  "launch",
  "close_approach",
  "grb",
  "gw",
  "neutrino",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface Geo {
  lat: number;
  lon: number;
  depth_km?: number | null;
}

export interface Sky {
  ra: number;
  dec: number;
  error_deg?: number | null;
}

// What pollers/bridge POST to /ingest: envelope minus id, sig, ingested_at.
export interface IngestBody {
  type: EventType;
  time: string;
  source: string;
  upstream_id: string;
  upstream_url?: string | null;
  title: string;
  magnitude?: number | null;
  mag_kind?: string | null;
  geo?: Geo | null;
  sky?: Sky | null;
  payload?: unknown;
}

export interface Envelope extends IngestBody {
  id: string;
  schema: "planetlog/v1";
  ingested_at: string;
  sig?: string;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Returns an error string, or null when valid.
export function validateIngest(b: unknown): string | null {
  if (typeof b !== "object" || b === null || Array.isArray(b)) return "body must be a JSON object";
  const o = b as Record<string, unknown>;

  if (!EVENT_TYPES.includes(o.type as EventType)) return `type must be one of ${EVENT_TYPES.join(",")}`;
  if (typeof o.time !== "string" || !RFC3339.test(o.time)) return "time must be RFC 3339";
  if (typeof o.source !== "string" || o.source.length === 0) return "source required";
  if (typeof o.upstream_id !== "string" || o.upstream_id.length === 0) return "upstream_id required";
  if (typeof o.title !== "string" || o.title.length === 0) return "title required";
  if (o.magnitude != null && !isFiniteNumber(o.magnitude)) return "magnitude must be a number or null";
  if (o.mag_kind != null && typeof o.mag_kind !== "string") return "mag_kind must be a string or null";

  const geo = o.geo as Geo | null | undefined;
  if (geo != null) {
    if (!isFiniteNumber(geo.lat) || geo.lat < -90 || geo.lat > 90) return "geo.lat out of range";
    if (!isFiniteNumber(geo.lon) || geo.lon < -180 || geo.lon > 180) return "geo.lon out of range";
    if (geo.depth_km != null && !isFiniteNumber(geo.depth_km)) return "geo.depth_km must be a number";
  }
  const sky = o.sky as Sky | null | undefined;
  if (sky != null) {
    if (!isFiniteNumber(sky.ra) || sky.ra < 0 || sky.ra >= 360) return "sky.ra out of range";
    if (!isFiniteNumber(sky.dec) || sky.dec < -90 || sky.dec > 90) return "sky.dec out of range";
    if (sky.error_deg != null && !isFiniteNumber(sky.error_deg)) return "sky.error_deg must be a number";
  }
  if (geo == null && sky == null) return "at least one of geo/sky must be present";

  if (o.id !== undefined || o.sig !== undefined || o.ingested_at !== undefined) {
    return "id, sig, ingested_at are assigned by the ledger — do not send them";
  }
  return null;
}

// JCS: recursive lexicographic (UTF-16 code unit) key sort; undefined members dropped.
export function canonicalize(v: unknown): string {
  if (v === undefined) throw new Error("cannot canonicalize undefined");
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return "[" + v.map((x) => canonicalize(x === undefined ? null : x)).join(",") + "]";
  }
  const o = v as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(o).sort()) {
    if (o[k] === undefined) continue;
    parts.push(JSON.stringify(k) + ":" + canonicalize(o[k]));
  }
  return "{" + parts.join(",") + "}";
}
