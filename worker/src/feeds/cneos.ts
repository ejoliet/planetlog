import { validateIngest, type IngestBody } from "../envelope.ts";
import { USER_AGENT } from "./index.ts";

export const CNEOS_API_URL = "https://ssd-api.jpl.nasa.gov/cad.api";

// Build CNEOS API URL with explicit date-min and date-max (YYYY-MM-DD format).
export function cneosUrl(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const dateMin = `${year}-${month}-${day}`;

  // date-max: now + 7 days
  const maxDate = new Date(now);
  maxDate.setUTCDate(maxDate.getUTCDate() + 7);
  const maxYear = maxDate.getUTCFullYear();
  const maxMonth = String(maxDate.getUTCMonth() + 1).padStart(2, "0");
  const maxDay = String(maxDate.getUTCDate()).padStart(2, "0");
  const dateMax = `${maxYear}-${maxMonth}-${maxDay}`;

  const params = new URLSearchParams({
    "dist-max": "10LD",
    "date-min": dateMin,
    "date-max": dateMax,
    sort: "date",
  });

  return `${CNEOS_API_URL}?${params.toString()}`;
}

// Map month abbreviation to zero-padded month number.
function monthToNum(abbrev: string): string {
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  return months[abbrev] || "00";
}

// Convert "2026-Sep-25 13:47" to "2026-09-25T13:47:00Z".
function parseCneosTime(cdStr: string): string {
  // Format: "YYYY-Mon-DD HH:MM"
  const match = cdStr.match(/^(\d{4})-(\w{3})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match || !match[1] || !match[2] || !match[3] || !match[4] || !match[5]) return "";
  const year = match[1];
  const monthAbbrev = match[2];
  const day = match[3];
  const hour = match[4];
  const minute = match[5];
  const month = monthToNum(monthAbbrev);
  return `${year}-${month}-${day}T${hour}:${minute}:00Z`;
}

// Render diameter in approximate meters or kilometers.
// Formula: D_km = 1329/sqrt(0.14) * 10^(-H/5)
function diameterHint(h: number | null): string | null {
  if (h === null || typeof h !== "number") return null;
  const c = 1329 / Math.sqrt(0.14);
  const diameterKm = c * Math.pow(10, -h / 5);
  const diameterM = diameterKm * 1000;

  if (diameterM < 1000) {
    const rounded = Math.round(diameterM / 10) * 10;
    return `~${rounded} m`;
  } else {
    const rounded = Math.round(diameterKm * 10) / 10;
    return `~${rounded} km`;
  }
}

// Convert a single CNEOS row to IngestBody.
// Returns null if des, cd, or dist are missing/invalid.
export function normalizeCneosRow(fields: string[], row: unknown[]): IngestBody | null {
  if (!Array.isArray(fields) || !Array.isArray(row) || row.length === 0) return null;

  // Zip fields -> row into an object
  const rowObj: Record<string, unknown> = {};
  for (let i = 0; i < fields.length && i < row.length; i++) {
    const fieldName = fields[i];
    if (fieldName !== undefined) {
      rowObj[fieldName] = row[i];
    }
  }

  const des = rowObj.des;
  const cd = rowObj.cd;
  const dist = rowObj.dist;
  const h = rowObj.h;

  // Validate required fields
  if (typeof des !== "string" || des.length === 0) return null;
  if (typeof cd !== "string" || cd.length === 0) return null;
  if (typeof dist !== "string" || dist.length === 0) return null;

  const distNum = Number(dist);
  if (!Number.isFinite(distNum)) return null;

  const time = parseCneosTime(cd);
  if (!time) return null;

  // LD conversion: dist (AU) / 0.002569555
  const ld = distNum / 0.002569555;

  // H: magnitude; derive diameter if present
  let hNum: number | null = null;
  if (typeof h === "string") {
    hNum = Number(h);
    if (!Number.isFinite(hNum)) hNum = null;
  }

  const diamHint = diameterHint(hNum);
  const title =
    diamHint !== null
      ? `${des} passes ${ld.toFixed(2)} LD (${diamHint})`
      : `${des} passes ${ld.toFixed(2)} LD`;

  const body: IngestBody = {
    type: "close_approach",
    time,
    source: "cneos",
    upstream_id: `${des}@${cd}`,
    upstream_url: "https://cneos.jpl.nasa.gov/ca/",
    title,
    magnitude: null,
    mag_kind: null,
    geo: null,
    sky: null,
    payload: rowObj,
  };

  // Validate before returning
  const error = validateIngest(body);
  if (error) return null;

  return body;
}

// Convert CNEOS API response to array of IngestBody, dropping nulls.
export function normalizeCneosFeed(resp: unknown): IngestBody[] {
  if (typeof resp !== "object" || resp === null) return [];

  const r = resp as Record<string, unknown>;
  const fields = r.fields;
  const data = r.data;

  if (!Array.isArray(fields) || !Array.isArray(data)) return [];

  return data
    .map((row) => normalizeCneosRow(fields, row))
    .filter((body): body is IngestBody => body !== null);
}

// Fetch CNEOS feed and return normalized IngestBody array.
export async function fetchCneos(
  fetchFn: typeof fetch = fetch,
  now = new Date()
): Promise<IngestBody[]> {
  const url = cneosUrl(now);

  const response = await fetchFn(url, {
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`CNEOS feed fetch failed with status ${response.status}`);
  }

  const json = await response.json();
  return normalizeCneosFeed(json);
}
