import { validateIngest, type IngestBody } from "../envelope.ts";
import { USER_AGENT } from "./index.ts";

export const SWPC_FEED_URL = "https://services.swpc.noaa.gov/products/alerts.json";

// Extract the first meaningful line (title) from the message after the header block.
// Headers are lines like "Space Weather Message Code:", "Serial Number:", "Issue Time:".
// The first non-empty line after a blank line is the title.
function extractTitle(message: string): string {
  // Split on individual line breaks to preserve blank lines
  const lines = message.split(/\r?\n/);
  let foundBlank = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip non-empty lines until we find a blank line (end of header)
    if (!trimmed) {
      foundBlank = true;
      continue;
    }
    // Once we've passed the blank line, return the first non-empty line
    if (foundBlank) {
      return trimmed.substring(0, 120); // max 120 chars
    }
  }
  return ""; // fallback (should not happen with well-formed messages)
}

// Extract magnitude from message based on patterns: K-index of N, Category GN, Noaa Scale: SN, etc.
function extractMagnitude(message: string): { magnitude: number | null; mag_kind: string | null } {
  // K-index: "K-index of 4", "K-index of 5", etc.
  const kIndexMatch = message.match(/K-index of (\d+)/i);
  if (kIndexMatch && kIndexMatch[1]) {
    const kValue = parseInt(kIndexMatch[1], 10);
    if (kValue >= 4 && kValue <= 9) {
      return { magnitude: kValue, mag_kind: "Kp" };
    }
  }

  // G-scale: "Category G1", "Category G2", etc.
  const gScaleMatch = message.match(/Category G(\d+)/i);
  if (gScaleMatch && gScaleMatch[1]) {
    return { magnitude: parseInt(gScaleMatch[1], 10), mag_kind: "G" };
  }

  // S-scale: "Category S1" or "Noaa Scale: S1"
  const sScaleMatch = message.match(/(?:Category|Noaa Scale:)\s*S(\d+)/i);
  if (sScaleMatch && sScaleMatch[1]) {
    return { magnitude: parseInt(sScaleMatch[1], 10), mag_kind: "S" };
  }

  // R-scale (radio blackout): "Category R1" or "Noaa Scale: R1"
  const rScaleMatch = message.match(/(?:Category|Noaa Scale:)\s*R(\d+)/i);
  if (rScaleMatch && rScaleMatch[1]) {
    return { magnitude: parseInt(rScaleMatch[1], 10), mag_kind: "R" };
  }

  return { magnitude: null, mag_kind: null };
}

// Map a SWPC alert entry to IngestBody.
// Returns null if product_id or issue_datetime is missing.
export function normalizeSwpcAlert(entry: unknown): IngestBody | null {
  if (typeof entry !== "object" || entry === null) return null;

  const e = entry as Record<string, unknown>;
  const product_id = e.product_id;
  const issue_datetime = e.issue_datetime;
  const message = e.message;

  // Validate required fields
  if (typeof product_id !== "string") return null;
  if (typeof issue_datetime !== "string") return null;
  if (typeof message !== "string") return null;

  // Parse issue_datetime: "2026-09-24 14:30:01.217" (space-separated) -> "2026-09-24T14:30:01Z"
  const dtMatch = issue_datetime.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!dtMatch) return null;

  const time = `${dtMatch[1]}-${dtMatch[2]}-${dtMatch[3]}T${dtMatch[4]}:${dtMatch[5]}:${dtMatch[6]}Z`;

  const title = extractTitle(message);
  if (!title) return null; // No meaningful title found

  const { magnitude, mag_kind } = extractMagnitude(message);

  const body: IngestBody = {
    type: "space_weather",
    time,
    source: "swpc",
    upstream_id: `${product_id}:${issue_datetime}`,
    upstream_url: "https://www.swpc.noaa.gov/products/alerts-watches-and-warnings",
    title,
    magnitude,
    mag_kind,
    geo: null,
    sky: null,
    payload: entry,
  };

  // Validate before returning
  const error = validateIngest(body);
  if (error) return null;

  return body;
}

// Map an array of SWPC alert entries to IngestBody array, dropping nulls.
export function normalizeSwpcFeed(list: unknown): IngestBody[] {
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => normalizeSwpcAlert(item))
    .filter((body): body is IngestBody => body !== null);
}

// Fetch the SWPC alerts feed and return normalized IngestBody array.
export async function fetchSwpc(fetchFn: typeof fetch = fetch): Promise<IngestBody[]> {
  const response = await fetchFn(SWPC_FEED_URL, {
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`SWPC feed fetch failed with status ${response.status}`);
  }

  const json = await response.json();
  return normalizeSwpcFeed(json);
}
