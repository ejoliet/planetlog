import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLl2Launch, normalizeLl2Feed, fetchLl2 } from "../src/feeds/ll2.ts";
import { validateIngest } from "../src/envelope.ts";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, "../../fixtures/ll2-upcoming.sample.json"), "utf-8"));

test("normalizeLl2Launch: each fixture launch normalizes to IngestBody", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body, `should normalize launch ${launch.id}`);
    assert.strictEqual(body.type, "launch");
    assert.strictEqual(body.source, "ll2");
    assert.strictEqual(body.upstream_id, launch.id);
  }
});

test("normalizeLl2Launch: normalized bodies pass validateIngest", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    const error = validateIngest(body);
    assert.strictEqual(error, null, `body for ${launch.id} should validate: ${error}`);
  }
});

test("normalizeLl2Launch: time is YYYY-MM-DDTHH:MM:SSZ with no milliseconds", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    const timeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    assert.match(body.time, timeRegex, `time ${body.time} should match RFC3339 without millis`);
  }
});

test("normalizeLl2Launch: geo coordinates are numeric and match pad (lat, lon)", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    assert.ok(body.geo);
    assert.strictEqual(typeof body.geo.lat, "number", "latitude must be number");
    assert.strictEqual(typeof body.geo.lon, "number", "longitude must be number");
    assert.strictEqual(body.geo.lat, launch.pad.latitude, `latitude should match pad.latitude`);
    assert.strictEqual(body.geo.lon, launch.pad.longitude, `longitude should match pad.longitude`);
    assert.strictEqual(body.geo.depth_km, null, "depth_km should be null");
  }
});

test("normalizeLl2Launch: title format is name — abbrev", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    const expected = `${launch.name} — ${launch.status.abbrev}`;
    assert.strictEqual(body.title, expected, `title should be "${expected}"`);
  }
});

test("normalizeLl2Launch: magnitude and mag_kind are null", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    assert.strictEqual(body.magnitude, null);
    assert.strictEqual(body.mag_kind, null);
  }
});

test("normalizeLl2Launch: upstream_url is launch url", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    assert.strictEqual(body.upstream_url, launch.url);
  }
});

test("normalizeLl2Launch: payload is launch verbatim", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    assert.deepStrictEqual(body.payload, launch);
  }
});

test("normalizeLl2Launch: sky is null", () => {
  for (const launch of fixture) {
    const body = normalizeLl2Launch(launch);
    assert.ok(body);
    assert.strictEqual(body.sky, null);
  }
});

test("normalizeLl2Launch: handles string pad coordinates", () => {
  const launchWithStringCoords = {
    id: "test-uuid",
    name: "Test Rocket",
    net: "2026-09-26T00:00:00Z",
    url: "https://ll.thespacedevs.com/2.3.0/launches/test-uuid/",
    status: { abbrev: "Go", name: "Go for Launch" },
    pad: {
      latitude: "38.8583",
      longitude: "111.5802",
    },
  };

  const body = normalizeLl2Launch(launchWithStringCoords);
  assert.ok(body);
  assert.strictEqual(typeof body.geo.lat, "number");
  assert.strictEqual(typeof body.geo.lon, "number");
  assert.strictEqual(body.geo.lat, 38.8583);
  assert.strictEqual(body.geo.lon, 111.5802);
});

test("normalizeLl2Launch: missing pad returns null", () => {
  const noPad = {
    id: "test-uuid",
    name: "Test Rocket",
    net: "2026-09-26T00:00:00Z",
    url: "https://ll.thespacedevs.com/2.3.0/launches/test-uuid/",
    status: { abbrev: "Go", name: "Go for Launch" },
  };

  const body = normalizeLl2Launch(noPad);
  assert.strictEqual(body, null);
});

test("normalizeLl2Launch: NaN pad coordinates return null", () => {
  const nanPad = {
    id: "test-uuid",
    name: "Test Rocket",
    net: "2026-09-26T00:00:00Z",
    url: "https://ll.thespacedevs.com/2.3.0/launches/test-uuid/",
    status: { abbrev: "Go", name: "Go for Launch" },
    pad: {
      latitude: "invalid",
      longitude: 111.5802,
    },
  };

  const body = normalizeLl2Launch(nanPad);
  assert.strictEqual(body, null);
});

test("normalizeLl2Launch: missing id returns null", () => {
  const noId = {
    name: "Test Rocket",
    net: "2026-09-26T00:00:00Z",
    url: "https://ll.thespacedevs.com/2.3.0/launches/test-uuid/",
    status: { abbrev: "Go", name: "Go for Launch" },
    pad: { latitude: 38.8583, longitude: 111.5802 },
  };

  const body = normalizeLl2Launch(noId);
  assert.strictEqual(body, null);
});

test("normalizeLl2Launch: missing name returns null", () => {
  const noName = {
    id: "test-uuid",
    net: "2026-09-26T00:00:00Z",
    url: "https://ll.thespacedevs.com/2.3.0/launches/test-uuid/",
    status: { abbrev: "Go", name: "Go for Launch" },
    pad: { latitude: 38.8583, longitude: 111.5802 },
  };

  const body = normalizeLl2Launch(noName);
  assert.strictEqual(body, null);
});

test("normalizeLl2Launch: missing net returns null", () => {
  const noNet = {
    id: "test-uuid",
    name: "Test Rocket",
    url: "https://ll.thespacedevs.com/2.3.0/launches/test-uuid/",
    status: { abbrev: "Go", name: "Go for Launch" },
    pad: { latitude: 38.8583, longitude: 111.5802 },
  };

  const body = normalizeLl2Launch(noNet);
  assert.strictEqual(body, null);
});

test("normalizeLl2Feed: maps page.results and drops nulls", () => {
  const page = { results: fixture };
  const bodies = normalizeLl2Feed(page);
  assert.strictEqual(bodies.length, 3);
  assert.ok(bodies.every((b) => b !== null && b.type === "launch"));
});

test("normalizeLl2Feed: handles empty results", () => {
  const page = { results: [] };
  const bodies = normalizeLl2Feed(page);
  assert.strictEqual(bodies.length, 0);
});

test("fetchLl2 with stubbed fetchFn returns normalized launches", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify({ results: fixture }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const bodies = await fetchLl2(stubFetch);
  assert.strictEqual(bodies.length, 3);
  assert.ok(bodies.every((b) => b.type === "launch"));
});

test("fetchLl2 throws on non-ok response", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(
    async () => {
      await fetchLl2(stubFetch);
    },
    (err) => {
      return err instanceof Error && err.message.includes("status 500");
    }
  );
});

test("fetchLl2 throws on 429 with '429' in message", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(
    async () => {
      await fetchLl2(stubFetch);
    },
    (err) => {
      return err instanceof Error && err.message.includes("429");
    }
  );
});

test("fetchLl2 includes USER_AGENT header", async () => {
  let capturedHeaders;
  const stubFetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    return new Response(JSON.stringify({ results: fixture }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await fetchLl2(stubFetch);
  assert.ok(capturedHeaders);
  assert.ok(capturedHeaders["user-agent"]);
  assert.match(capturedHeaders["user-agent"], /planetlog/);
});

test("normalizeLl2Launch: TBD status is skipped (placeholder date)", () => {
  const launch = {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Falcon 9 Block 5 | Something",
    net: "2026-11-01T00:00:00Z",
    status: { abbrev: "TBD", name: "To Be Determined" },
    pad: { latitude: "28.5", longitude: "-80.5" },
  };
  assert.equal(normalizeLl2Launch(launch), null);
});
