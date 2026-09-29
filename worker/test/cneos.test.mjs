import test from "node:test";
import assert from "node:assert/strict";
import {
  cneosUrl,
  normalizeCneosRow,
  normalizeCneosFeed,
  fetchCneos,
} from "../src/feeds/cneos.ts";
import { validateIngest } from "../src/envelope.ts";

const fixture = {
  signature: {
    source: "NASA/JPL SBDB Close Approach Data API",
    version: "1.5",
  },
  count: 4,
  fields: ["des", "orbit_id", "jd", "cd", "dist", "dist_min", "dist_max", "v_rel", "v_inf", "t_sigma_f", "h"],
  data: [
    ["2026 SC", "8", "2461309.074549052", "2026-Sep-25 13:47", "0.00437881823129761", "0.00437355303006425", "0.00438408318561174", "7.75044059768021", "7.67152813141025", "< 00:01", "26.422"],
    ["2026 RN15", "2", "2461311.385306987", "2026-Sep-27 21:15", "0.0213866184505058", "0.0212332857277069", "0.0215399379842198", "6.47277201752468", "6.45349556606052", "00:03", "26.156"],
    ["2026 SA8", "1", "2461311.781406648", "2026-Sep-28 06:45", "0.00253925938809526", "0.00250538178713651", "0.00257309430106221", "6.61131689150686", "6.45064988171152", "00:22", "28.634"],
    ["2026 SX2", "2", "2461312.257179701", "2026-Sep-28 18:10", "0.0105368387452306", "0.010485857077955", "0.0105878164602817", "7.68330856696132", "7.65032581299339", "00:02", "27.27"],
  ],
};

test("normalizeCneosRow: each fixture row normalizes to IngestBody", () => {
  for (const row of fixture.data) {
    const body = normalizeCneosRow(fixture.fields, row);
    assert.ok(body, `should normalize row [${row[0]}]`);
    assert.strictEqual(body.type, "close_approach");
    assert.strictEqual(body.source, "cneos");
  }
});

test("normalizeCneosRow: normalized bodies pass validateIngest", () => {
  for (const row of fixture.data) {
    const body = normalizeCneosRow(fixture.fields, row);
    assert.ok(body);
    const error = validateIngest(body);
    assert.strictEqual(error, null, `body for row [${row[0]}] should validate: ${error}`);
  }
});

test("normalizeCneosRow: time is YYYY-MM-DDTHH:MM:SSZ format", () => {
  for (const row of fixture.data) {
    const body = normalizeCneosRow(fixture.fields, row);
    assert.ok(body);
    const timeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    assert.match(body.time, timeRegex, `time ${body.time} should match RFC3339 without millis`);
  }
});

test("normalizeCneosRow: time conversion for '2026-Sep-25 13:47' to '2026-09-25T13:47:00Z'", () => {
  const row = fixture.data[0]; // "2026-Sep-25 13:47"
  const body = normalizeCneosRow(fixture.fields, row);
  assert.ok(body);
  assert.strictEqual(body.time, "2026-09-25T13:47:00Z");
});

test("normalizeCneosRow: upstream_id is des@cd", () => {
  for (const row of fixture.data) {
    const body = normalizeCneosRow(fixture.fields, row);
    assert.ok(body);
    const des = row[0];
    const cd = row[3];
    assert.strictEqual(body.upstream_id, `${des}@${cd}`);
  }
});

test("normalizeCneosRow: upstream_url is https://cneos.jpl.nasa.gov/ca/", () => {
  const body = normalizeCneosRow(fixture.fields, fixture.data[0]);
  assert.ok(body);
  assert.strictEqual(body.upstream_url, "https://cneos.jpl.nasa.gov/ca/");
});

test("normalizeCneosRow: magnitude and mag_kind are null", () => {
  const body = normalizeCneosRow(fixture.fields, fixture.data[0]);
  assert.ok(body);
  assert.strictEqual(body.magnitude, null);
  assert.strictEqual(body.mag_kind, null);
});

test("normalizeCneosRow: geo and sky are null", () => {
  const body = normalizeCneosRow(fixture.fields, fixture.data[0]);
  assert.ok(body);
  assert.strictEqual(body.geo, null);
  assert.strictEqual(body.sky, null);
});

test("normalizeCneosRow: LD calculation for dist 0.00437881823129761 AU", () => {
  // First row: dist = 0.00437881823129761
  // LD = dist / 0.002569555
  const expectedLd = 0.00437881823129761 / 0.002569555;
  const body = normalizeCneosRow(fixture.fields, fixture.data[0]);
  assert.ok(body);
  // Title should include LD
  assert.match(body.title, new RegExp(`${expectedLd.toFixed(2)} LD`));
});

test("normalizeCneosRow: diameter hint for H=26.422", () => {
  // H=26.422 for first row
  // D_km = 1329/sqrt(0.14) * 10^(-26.422/5)
  const h = 26.422;
  const c = 1329 / Math.sqrt(0.14);
  const diameterKm = c * Math.pow(10, -h / 5);
  const diameterM = diameterKm * 1000;
  let expected;
  if (diameterM < 1000) {
    const rounded = Math.round(diameterM / 10) * 10;
    expected = `~${rounded} m`;
  } else {
    const rounded = Math.round(diameterKm * 10) / 10;
    expected = `~${rounded} km`;
  }
  const body = normalizeCneosRow(fixture.fields, fixture.data[0]);
  assert.ok(body);
  assert.match(body.title, new RegExp(`\\(${expected.replace(/\./g, "\\.")}\\)`));
});

test("normalizeCneosRow: diameter hint for H=22 (ballpark ~140 m)", () => {
  // Compute exact: D_km = 1329/sqrt(0.14) * 10^(-22/5)
  const h = 22;
  const c = 1329 / Math.sqrt(0.14);
  const diameterKm = c * Math.pow(10, -h / 5);
  const diameterM = diameterKm * 1000;
  const rounded = Math.round(diameterM / 10) * 10;
  // Should be around 141.56 m, rounded to ~140 m
  assert.ok(diameterM > 130 && diameterM < 150, `H=22 should yield diameter ~130-150m, got ${diameterM}m`);
});

test("normalizeCneosRow: missing des returns null", () => {
  const row = ["", "8", "2461309.074549052", "2026-Sep-25 13:47", "0.00437881823129761", "0.00437355303006425", "0.00438408318561174", "7.75044059768021", "7.67152813141025", "< 00:01", "26.422"];
  const body = normalizeCneosRow(fixture.fields, row);
  assert.strictEqual(body, null);
});

test("normalizeCneosRow: missing cd returns null", () => {
  const row = ["2026 SC", "8", "2461309.074549052", "", "0.00437881823129761", "0.00437355303006425", "0.00438408318561174", "7.75044059768021", "7.67152813141025", "< 00:01", "26.422"];
  const body = normalizeCneosRow(fixture.fields, row);
  assert.strictEqual(body, null);
});

test("normalizeCneosRow: missing dist returns null", () => {
  const row = ["2026 SC", "8", "2461309.074549052", "2026-Sep-25 13:47", "", "0.00437355303006425", "0.00438408318561174", "7.75044059768021", "7.67152813141025", "< 00:01", "26.422"];
  const body = normalizeCneosRow(fixture.fields, row);
  assert.strictEqual(body, null);
});

test("normalizeCneosRow: invalid dist (non-numeric) returns null", () => {
  const row = ["2026 SC", "8", "2461309.074549052", "2026-Sep-25 13:47", "invalid", "0.00437355303006425", "0.00438408318561174", "7.75044059768021", "7.67152813141025", "< 00:01", "26.422"];
  const body = normalizeCneosRow(fixture.fields, row);
  assert.strictEqual(body, null);
});

test("normalizeCneosRow: payload is zipped object verbatim", () => {
  const row = fixture.data[0];
  const body = normalizeCneosRow(fixture.fields, row);
  assert.ok(body);
  assert.ok(typeof body.payload === "object" && body.payload !== null);
  const payload = body.payload;
  assert.strictEqual(payload.des, "2026 SC");
  assert.strictEqual(payload.cd, "2026-Sep-25 13:47");
  assert.strictEqual(payload.dist, "0.00437881823129761");
});

test("normalizeCneosFeed: maps data array and drops nulls", () => {
  const bodies = normalizeCneosFeed(fixture);
  assert.strictEqual(bodies.length, 4);
  assert.ok(bodies.every((b) => b !== null && b.type === "close_approach"));
});

test("cneosUrl: formats date-min and date-max correctly", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  const url = cneosUrl(now);

  // Should contain date-min=2026-09-24 and date-max=2026-10-01
  assert.match(url, /date-min=2026-09-24/);
  assert.match(url, /date-max=2026-10-01/);
  assert.match(url, /dist-max=10LD/);
  assert.match(url, /sort=date/);
});

test("cneosUrl: handles month boundaries (end of month)", () => {
  const now = new Date("2026-09-28T00:00:00Z");
  const url = cneosUrl(now);

  // Sept 28 + 7 = Oct 5
  assert.match(url, /date-min=2026-09-28/);
  assert.match(url, /date-max=2026-10-05/);
});

test("cneosUrl: handles year boundaries (end of year)", () => {
  const now = new Date("2026-12-28T00:00:00Z");
  const url = cneosUrl(now);

  // Dec 28 + 7 = Jan 4 (next year)
  assert.match(url, /date-min=2026-12-28/);
  assert.match(url, /date-max=2027-01-04/);
});

test("fetchCneos with stubbed fetchFn returns normalized events", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const bodies = await fetchCneos(stubFetch, new Date("2026-09-24T00:00:00Z"));
  assert.strictEqual(bodies.length, 4);
  assert.ok(bodies.every((b) => b.type === "close_approach"));
});

test("fetchCneos throws on non-ok response", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(
    async () => {
      await fetchCneos(stubFetch, new Date("2026-09-24T00:00:00Z"));
    },
    (err) => {
      return err instanceof Error && err.message.includes("status 500");
    }
  );
});
