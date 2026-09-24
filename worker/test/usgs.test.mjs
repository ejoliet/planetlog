import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUsgs, normalizeUsgsFeed, fetchUsgs } from "../src/feeds/usgs.ts";
import { validateIngest } from "../src/envelope.ts";

const fixture = {
  type: "FeatureCollection",
  metadata: {
    generated: 1790285233000,
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    title: "USGS All Earthquakes, Past Hour",
    status: 200,
    api: "2.7.0",
    count: 6,
  },
  features: [
    {
      type: "Feature",
      properties: {
        mag: 1.73,
        place: "5 km WSW of Volcano, Hawaii",
        time: 1790284567170,
        updated: 1790284770130,
        tz: null,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/hv75043422",
        detail: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/hv75043422.geojson",
        felt: null,
        cdi: null,
        mmi: null,
        alert: null,
        status: "automatic",
        tsunami: 0,
        sig: 46,
        net: "hv",
        code: "75043422",
        ids: ",hv75043422,",
        sources: ",hv,",
        types: ",origin,phase-data,",
        nst: 16,
        dmin: 0.00363,
        rms: 0.200000003,
        gap: 60,
        magType: "ml",
        type: "earthquake",
        title: "M 1.7 - 5 km WSW of Volcano, Hawaii",
      },
      geometry: {
        type: "Point",
        coordinates: [-155.281005859375, 19.4198341369629, -0.159999996423721],
      },
      id: "hv75043422",
    },
    {
      type: "Feature",
      properties: {
        mag: 2.8,
        place: "32 km SW of Garden City, Texas",
        time: 1790283421030,
        updated: 1790284090507,
        tz: null,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/tx2026svwvaw",
        detail: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/tx2026svwvaw.geojson",
        felt: null,
        cdi: null,
        mmi: null,
        alert: null,
        status: "reviewed",
        tsunami: 0,
        sig: 121,
        net: "tx",
        code: "2026svwvaw",
        ids: ",tx2026svwvaw,",
        sources: ",tx,",
        types: ",origin,phase-data,",
        nst: 19,
        dmin: 0,
        rms: 0.1,
        gap: 59,
        magType: "ml",
        type: "earthquake",
        title: "M 2.8 - 32 km SW of Garden City, Texas",
      },
      geometry: {
        type: "Point",
        coordinates: [-101.746, 31.676, 4.9072],
      },
      id: "tx2026svwvaw",
    },
    {
      type: "Feature",
      properties: {
        mag: 1.59,
        place: "7 km NW of The Geysers, CA",
        time: 1790283405330,
        updated: 1790283622230,
        tz: null,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/nc75441107",
        detail: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/nc75441107.geojson",
        felt: null,
        cdi: null,
        mmi: null,
        alert: null,
        status: "automatic",
        tsunami: 0,
        sig: 39,
        net: "nc",
        code: "75441107",
        ids: ",nc75441107,",
        sources: ",nc,",
        types: ",focal-mechanism,nearby-cities,origin,phase-data,",
        nst: 36,
        dmin: 0.001925,
        rms: 0.02,
        gap: 39,
        magType: "md",
        type: "earthquake",
        title: "M 1.6 - 7 km NW of The Geysers, CA",
      },
      geometry: {
        type: "Point",
        coordinates: [-122.811164855957, 38.8216667175293, 2.58999991416931],
      },
      id: "nc75441107",
    },
  ],
};

test("normalizeUsgs: each fixture feature normalizes to IngestBody", () => {
  for (const feature of fixture.features) {
    const body = normalizeUsgs(feature);
    assert.ok(body, `should normalize feature ${feature.id}`);
    assert.strictEqual(body.type, "quake");
    assert.strictEqual(body.source, "usgs");
    assert.strictEqual(body.upstream_id, feature.id);
  }
});

test("normalizeUsgs: normalized bodies pass validateIngest", () => {
  for (const feature of fixture.features) {
    const body = normalizeUsgs(feature);
    assert.ok(body);
    const error = validateIngest(body);
    assert.strictEqual(error, null, `body for ${feature.id} should validate: ${error}`);
  }
});

test("normalizeUsgs: time is YYYY-MM-DDTHH:MM:SSZ with no milliseconds", () => {
  for (const feature of fixture.features) {
    const body = normalizeUsgs(feature);
    assert.ok(body);
    const timeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    assert.match(body.time, timeRegex, `time ${body.time} should match RFC3339 without millis`);
  }
});

test("normalizeUsgs: geo coordinates pulled correctly (lon, lat, depth)", () => {
  const feature = fixture.features[0];
  const coords = feature.geometry.coordinates;
  const body = normalizeUsgs(feature);
  assert.ok(body);
  assert.ok(body.geo);
  assert.strictEqual(body.geo.lon, coords[0], "longitude from coords[0]");
  assert.strictEqual(body.geo.lat, coords[1], "latitude from coords[1]");
  assert.strictEqual(body.geo.depth_km, coords[2], "depth from coords[2]");
});

test("normalizeUsgs: magnitude and mag_kind mapped correctly", () => {
  const feature = fixture.features[0];
  const body = normalizeUsgs(feature);
  assert.ok(body);
  assert.strictEqual(body.magnitude, feature.properties.mag);
  assert.strictEqual(body.mag_kind, feature.properties.magType);
});

test("normalizeUsgs: upstream_id equals feature.id", () => {
  for (const feature of fixture.features) {
    const body = normalizeUsgs(feature);
    assert.ok(body);
    assert.strictEqual(body.upstream_id, feature.id);
  }
});

test("normalizeUsgs: payload is feature verbatim", () => {
  for (const feature of fixture.features) {
    const body = normalizeUsgs(feature);
    assert.ok(body);
    assert.deepStrictEqual(body.payload, feature);
  }
});

test("normalizeUsgs: non-Point geometry returns null", () => {
  const notPoint = {
    type: "Feature",
    id: "test",
    properties: { time: 1790284567170, mag: 5.0, place: "Test" },
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
  };
  const body = normalizeUsgs(notPoint);
  assert.strictEqual(body, null);
});

test("normalizeUsgs: missing id returns null", () => {
  const noId = {
    type: "Feature",
    properties: { time: 1790284567170, mag: 5.0, place: "Test" },
    geometry: { type: "Point", coordinates: [0, 0] },
  };
  const body = normalizeUsgs(noId);
  assert.strictEqual(body, null);
});

test("normalizeUsgs: missing time returns null", () => {
  const noTime = {
    type: "Feature",
    id: "test",
    properties: { mag: 5.0, place: "Test" },
    geometry: { type: "Point", coordinates: [0, 0] },
  };
  const body = normalizeUsgs(noTime);
  assert.strictEqual(body, null);
});

test("normalizeUsgsFeed: maps collection.features and drops nulls", () => {
  const bodies = normalizeUsgsFeed(fixture);
  assert.strictEqual(bodies.length, 3);
  assert.ok(bodies.every((b) => b !== null && b.type === "quake"));
});

test("fetchUsgs with stubbed fetchFn returns normalized events", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const bodies = await fetchUsgs(stubFetch);
  assert.strictEqual(bodies.length, 3);
  assert.ok(bodies.every((b) => b.type === "quake"));
});

test("fetchUsgs throws on non-ok response", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(
    async () => {
      await fetchUsgs(stubFetch);
    },
    (err) => {
      return err instanceof Error && err.message.includes("status 500");
    }
  );
});
