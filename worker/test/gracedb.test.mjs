import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGracedbSuperevent,
  normalizeGracedbFeed,
  fetchGracedb,
  gpsToIso,
} from "../src/feeds/gracedb.ts";
import { validateIngest } from "../src/envelope.ts";

const fixture = {
  numRows: 5546,
  superevents: [
    {
      superevent_id: "S251118cm",
      gw_id: null,
      category: "Production",
      created: "2025-11-18 12:41:31 UTC",
      submitter: "read-cvmfs-emfollow",
      em_type: null,
      t_start: 1447504871.731934,
      t_0: 1447504872.731934,
      t_end: 1447504873.731934,
      far: 5.901454658684518e-06,
      time_coinc_far: null,
      space_coinc_far: null,
      labels: [
        "EM_READY",
        "SKYMAP_READY",
        "EMBRIGHT_READY",
        "PASTRO_READY",
        "DQOK",
        "LOW_SIGNIF_PRELIM_SENT",
        "LOW_SIGNIF_LOCKED",
      ],
      links: {
        self: "https://gracedb.ligo.org/api/v2/superevents/S251118cm/",
        labels: "https://gracedb.ligo.org/api/v2/superevents/S251118cm/labels/",
      },
      preferred_event_data: {
        graceid: "G619011",
        group: "CBC",
        pipeline: "pycbc",
        search: "AllSky",
        submitter: "pycbc-live",
        gpstime: 1447504872.731934,
        far: 5.901454658684518e-06,
      },
    },
    {
      superevent_id: "S251117dq",
      gw_id: null,
      category: "Production",
      created: "2025-11-17 21:38:45 UTC",
      submitter: "read-cvmfs-emfollow",
      em_type: null,
      t_start: 1447450730.097656,
      t_0: 1447450731.119385,
      t_end: 1447450732.122113,
      far: 5.867636084251777e-15,
      time_coinc_far: null,
      space_coinc_far: null,
      labels: [
        "EM_READY",
        "PE_READY",
        "ADVOK",
        "SKYMAP_READY",
        "EMBRIGHT_READY",
        "PASTRO_READY",
        "DQOK",
        "GCN_PRELIM_SENT",
        "DQR_REQUEST",
        "SIGNIF_LOCKED",
        "LOW_SIGNIF_LOCKED",
      ],
      links: {
        self: "https://gracedb.ligo.org/api/v2/superevents/S251117dq/",
        labels: "https://gracedb.ligo.org/api/v2/superevents/S251117dq/labels/",
      },
      preferred_event_data: {
        graceid: "G618744",
        group: "CBC",
        pipeline: "gstlal",
        search: "AllSky",
        submitter: "gstlalcbc_icds",
        gpstime: 1447450731.119385,
        far: 5.867636084251777e-15,
      },
    },
    {
      superevent_id: "S251117bc",
      gw_id: null,
      category: "Production",
      created: "2025-11-17 08:26:53 UTC",
      submitter: "read-cvmfs-emfollow",
      em_type: null,
      t_start: 1447403215.325317,
      t_0: 1447403216.329539,
      t_end: 1447403217.377145,
      far: 5.40702e-07,
      time_coinc_far: null,
      space_coinc_far: null,
      labels: [
        "EM_READY",
        "SKYMAP_READY",
        "EMBRIGHT_READY",
        "PASTRO_READY",
        "DQOK",
        "LOW_SIGNIF_PRELIM_SENT",
        "LOW_SIGNIF_LOCKED",
      ],
      links: {
        self: "https://gracedb.ligo.org/api/v2/superevents/S251117bc/",
        labels: "https://gracedb.ligo.org/api/v2/superevents/S251117bc/labels/",
      },
      preferred_event_data: {
        graceid: "G618551",
        group: "CBC",
        pipeline: "MBTA",
        search: "AllSky",
        submitter: "mbta-scitoken",
        gpstime: 1447403216.329539,
        far: 5.40702e-07,
      },
    },
  ],
};

test("gpsToIso: known value 1000000000 converts to 2011-09-14T01:46:22Z", () => {
  const result = gpsToIso(1000000000);
  assert.strictEqual(result, "2011-09-14T01:46:22Z");
});

test("normalizeGracedbSuperevent: each fixture superevent normalizes to IngestBody", () => {
  for (const se of fixture.superevents) {
    const body = normalizeGracedbSuperevent(se);
    assert.ok(body, `should normalize superevent ${se.superevent_id}`);
    assert.strictEqual(body.type, "gw");
    assert.strictEqual(body.source, "gracedb");
    assert.strictEqual(body.upstream_id, se.superevent_id);
  }
});

test("normalizeGracedbSuperevent: normalized bodies pass validateIngest", () => {
  for (const se of fixture.superevents) {
    const body = normalizeGracedbSuperevent(se);
    assert.ok(body);
    const error = validateIngest(body);
    assert.strictEqual(
      error,
      null,
      `body for ${se.superevent_id} should validate: ${error}`
    );
  }
});

test("normalizeGracedbSuperevent: missing superevent_id returns null", () => {
  const noId = {
    gw_id: null,
    category: "Production",
    t_0: 1447504872.731934,
    far: 5.901454658684518e-06,
    labels: [],
  };
  const body = normalizeGracedbSuperevent(noId);
  assert.strictEqual(body, null);
});

test("normalizeGracedbSuperevent: missing t_0 returns null", () => {
  const noTime = {
    superevent_id: "S251118cm",
    gw_id: null,
    category: "Production",
    far: 5.901454658684518e-06,
    labels: [],
  };
  const body = normalizeGracedbSuperevent(noTime);
  assert.strictEqual(body, null);
});

test("normalizeGracedbSuperevent: non-Production category excluded", () => {
  const mdc = {
    superevent_id: "S251118cm",
    gw_id: null,
    category: "MDC",
    t_0: 1447504872.731934,
    far: 5.901454658684518e-06,
    labels: [],
  };
  const body = normalizeGracedbSuperevent(mdc);
  assert.strictEqual(body, null);
});

test("normalizeGracedbSuperevent: test superevent (MS prefix) excluded", () => {
  const test = {
    superevent_id: "MS251118cm",
    gw_id: null,
    category: "Production",
    t_0: 1447504872.731934,
    far: 5.901454658684518e-06,
    labels: [],
  };
  const body = normalizeGracedbSuperevent(test);
  assert.strictEqual(body, null);
});

test("normalizeGracedbSuperevent: test superevent (TS prefix) excluded", () => {
  const test = {
    superevent_id: "TS251118cm",
    gw_id: null,
    category: "Production",
    t_0: 1447504872.731934,
    far: 5.901454658684518e-06,
    labels: [],
  };
  const body = normalizeGracedbSuperevent(test);
  assert.strictEqual(body, null);
});

test("normalizeGracedbSuperevent: time is YYYY-MM-DDTHH:MM:SSZ with no milliseconds", () => {
  for (const se of fixture.superevents) {
    const body = normalizeGracedbSuperevent(se);
    assert.ok(body);
    const timeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    assert.match(body.time, timeRegex, `time ${body.time} should match RFC3339 without millis`);
  }
});

test("normalizeGracedbSuperevent: upstream_id equals superevent_id", () => {
  for (const se of fixture.superevents) {
    const body = normalizeGracedbSuperevent(se);
    assert.ok(body);
    assert.strictEqual(body.upstream_id, se.superevent_id);
  }
});

test("normalizeGracedbSuperevent: upstream_url is constructed correctly", () => {
  const se = fixture.superevents[0];
  const body = normalizeGracedbSuperevent(se);
  assert.ok(body);
  assert.strictEqual(
    body.upstream_url,
    `https://gracedb.ligo.org/superevents/${se.superevent_id}/view/`
  );
});

test("normalizeGracedbSuperevent: payload is superevent verbatim", () => {
  for (const se of fixture.superevents) {
    const body = normalizeGracedbSuperevent(se);
    assert.ok(body);
    assert.deepStrictEqual(body.payload, se);
  }
});

test("normalizeGracedbSuperevent: magnitude and mag_kind are null", () => {
  for (const se of fixture.superevents) {
    const body = normalizeGracedbSuperevent(se);
    assert.ok(body);
    assert.strictEqual(body.magnitude, null);
    assert.strictEqual(body.mag_kind, null);
  }
});

test("normalizeGracedbSuperevent: geo and sky are null (gw is not located type)", () => {
  for (const se of fixture.superevents) {
    const body = normalizeGracedbSuperevent(se);
    assert.ok(body);
    assert.strictEqual(body.geo, null);
    assert.strictEqual(body.sky, null);
  }
});

test("normalizeGracedbSuperevent: title includes superevent_id, FAR, and labels", () => {
  const se = fixture.superevents[0];
  const body = normalizeGracedbSuperevent(se);
  assert.ok(body);
  assert.ok(body.title.includes(se.superevent_id));
  assert.ok(body.title.includes("candidate"));
  assert.ok(body.title.includes("FAR"));
  assert.ok(body.title.includes("1 per"));
});

test("normalizeGracedbSuperevent: FAR rendering for very small far (1e-13)", () => {
  const se = {
    superevent_id: "S251117xy",
    gw_id: null,
    category: "Production",
    t_0: 1447450731.119385,
    far: 1e-13,
    labels: [],
  };
  const body = normalizeGracedbSuperevent(se);
  assert.ok(body);
  // 1 / (1e-13 * 31557600) = 1 / (3.15576e-6) ≈ 316,877 years
  assert.ok(body.title.includes("1 per"));
  assert.ok(body.title.includes("years"));
});

test("normalizeGracedbFeed: maps superevents array and drops nulls", () => {
  const bodies = normalizeGracedbFeed(fixture);
  assert.strictEqual(bodies.length, 3);
  assert.ok(bodies.every((b) => b !== null && b.type === "gw"));
});

test("normalizeGracedbFeed: excludes non-Production superevents", () => {
  const testFeed = {
    superevents: [
      fixture.superevents[0],
      {
        superevent_id: "MS251118test",
        category: "MDC",
        t_0: 1447504872.731934,
        far: 5.901454658684518e-06,
        labels: [],
      },
    ],
  };
  const bodies = normalizeGracedbFeed(testFeed);
  assert.strictEqual(bodies.length, 1);
  assert.strictEqual(bodies[0].upstream_id, "S251118cm");
});

test("fetchGracedb with stubbed fetchFn returns normalized events", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const bodies = await fetchGracedb(stubFetch);
  assert.strictEqual(bodies.length, 3);
  assert.ok(bodies.every((b) => b.type === "gw"));
});

test("fetchGracedb throws on non-ok response", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(
    async () => {
      await fetchGracedb(stubFetch);
    },
    (err) => {
      return err instanceof Error && err.message.includes("status 500");
    }
  );
});

test("fetchGracedb: query form sets correct headers (user-agent and accept)", async () => {
  let capturedHeaders = null;
  const stubFetch = async (_url, options) => {
    capturedHeaders = options?.headers;
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await fetchGracedb(stubFetch);
  assert.ok(capturedHeaders);
  assert.ok(capturedHeaders["user-agent"]);
  assert.strictEqual(capturedHeaders["accept"], "application/json");
});
