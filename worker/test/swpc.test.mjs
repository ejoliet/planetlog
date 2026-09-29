import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSwpcAlert, normalizeSwpcFeed, fetchSwpc } from "../src/feeds/swpc.ts";
import { validateIngest } from "../src/envelope.ts";

const fixture = [
  {
    product_id: "K04A",
    issue_datetime: "2026-09-24 09:52:18.960",
    message: "Space Weather Message Code: ALTK04\nSerial Number: 2685\nIssue Time: 2026 Sep 24 0952 UTC\n\nALERT: Geomagnetic K-index of 4 \nThreshold Reached: 2026 Sep 24 0945 UTC\nSynoptic Period: 0900-1200\nActive Warning: YES\nComment: \n\nNOAA Space Weather Scale descriptions can be found at\nwww.swpc.noaa.gov/noaa-scales-explanation\n\nPotential Impacts: Area of impact primarily poleward of 65 degrees Geomagnetic Latitude.\nInduced Currents - Weak power grid fluctuations can occur.\nAurora - Aurora may be visible at high latitudes such as Canada and Alaska.",
  },
  {
    product_id: "K04W",
    issue_datetime: "2026-09-24 14:30:01.217",
    message: "Space Weather Message Code: WARK04\nSerial Number: 5420\nIssue Time: 2026 Sep 24 1430 UTC\n\nEXTENDED WARNING: Geomagnetic K-index of 4 expected\nExtension to Serial Number: 5419\nValid From: 2026 Sep 24 0944 UTC\nNow Valid Until: 2026 Sep 24 2100 UTC\nWarning Condition: Persistence\n\nNOAA Space Weather Scale descriptions can be found at\nwww.swpc.noaa.gov/noaa-scales-explanation\n\nPotential Impacts: Area of impact primarily poleward of 65 degrees Geomagnetic Latitude.\nInduced Currents - Weak power grid fluctuations can occur.\nAurora - Aurora may be visible at high latitudes such as Canada and Alaska.",
  },
  {
    product_id: "K05A",
    issue_datetime: "2026-09-08 17:51:10.343",
    message: "Space Weather Message Code: ALTK05\nSerial Number: 2049\nIssue Time: 2026 Sep 08 1751 UTC\n\nALERT: Geomagnetic K-index of 5 \nThreshold Reached: 2026 Sep 08 1744 UTC\nSynoptic Period: 1500-1800\nActive Warning: YES\nNoaa Scale: G1 - Minor\nComment: \n\nNOAA Scale: G1 - Minor\n\nNOAA Space Weather Scale descriptions can be found at\nwww.swpc.noaa.gov/noaa-scales-explanation\n\nPotential Impacts: Area of impact primarily poleward of 60 degrees Geomagnetic Latitude.\nInduced Currents - Weak power grid fluctuations can occur.\nSpacecraft - Minor impact on satellite operations possible.\nAurora - Aurora may be visible at high latitudes, i.e., northern tier of the U.S. such as northern Michigan and Maine.",
  },
  {
    product_id: "K05W",
    issue_datetime: "2026-09-15 18:56:11.670",
    message: "Space Weather Message Code: WARK05\nSerial Number: 2265\nIssue Time: 2026 Sep 15 1856 UTC\n\nWARNING: Geomagnetic K-index of 5 expected \nValid From: 2026 Sep 15 1855 UTC\nValid To: 2026 Sep 16 0600 UTC\nWarning Conditions: Onset\nNoaa Scale: G1 - Minor\nComment: \n\nNOAA Scale: G1 - Minor\n\nNOAA Space Weather Scale descriptions can be found at\nwww.swpc.noaa.gov/noaa-scales-explanation\n\nPotential Impacts: Area of impact primarily poleward of 60 degrees Geomagnetic Latitude.\nInduced Currents - Weak power grid fluctuations can occur.\nSpacecraft - Minor impact on satellite operations possible.\nAurora - Aurora may be visible at high latitudes, i.e., northern tier of the U.S. such as northern Michigan and Maine.",
  },
  {
    product_id: "A20F",
    issue_datetime: "2026-09-21 18:32:26.023",
    message: "Space Weather Message Code: WATA20\nSerial Number: 1126\nIssue Time: 2026 Sep 21 1832 UTC\n\nWATCH: Geomagnetic Storm Category G1 Predicted \nHighest Storm Level Predicted by Day:\nSep 22:  None (Below G1)   Sep 23:  None (Below G1)   Sep 24:  G1 (Minor)   \nTHIS SUPERSEDES ANY/ALL PRIOR WATCHES IN EFFECT\nComment: \n\nNOAA Space Weather Scale descriptions can be found at\nwww.swpc.noaa.gov/noaa-scales-explanation\n\nPotential Impacts: Area of impact primarily poleward of 60 degrees Geomagnetic Latitude.\nInduced Currents - Weak power grid fluctuations can occur.\nSpacecraft - Minor impact on satellite operations possible.\nAurora - Aurora may be visible at high latitudes, i.e., northern tier of the U.S. such as northern Michigan and Maine.",
  },
  {
    product_id: "A30F",
    issue_datetime: "2026-09-08 17:02:16.717",
    message: "Space Weather Message Code: WATA30\nSerial Number: 281\nIssue Time: 2026 Sep 08 1702 UTC\n\nWATCH: Geomagnetic Storm Category G2 Predicted \nHighest Storm Level Predicted by Day:\nSep 08:  G1 (Minor)   Sep 09:  G2 (Moderate)   Sep 10:  None (Below G1)   \nTHIS SUPERSEDES ANY/ALL PRIOR WATCHES IN EFFECT\nComment: \n\nNOAA Space Weather Scale descriptions can be found at\nwww.swpc.noaa.gov/noaa-scales-explanation\n\nPotential Impacts: Area of impact primarily poleward of 55 degrees Geomagnetic Latitude.\nInduced Currents - Power grid fluctuations can occur. High-latitude power systems may experience voltage alarms.\nSpacecraft - Satellite orientation irregularities may occur; increased drag on low Earth-orbit satellites is possible.\nRadio - HF (high frequency) radio propagation can fade at higher latitudes.\nAurora - Aurora may be seen as low as New York to Wisconsin to Washington state.",
  },
  {
    product_id: "P11A",
    issue_datetime: "2026-09-05 16:33:07.073",
    message: "Space Weather Message Code: ALTPX1\nSerial Number: 368\nIssue Time: 2026 Sep 05 1633 UTC\n\nALERT: Proton Event 10meV Integral Flux exceeded 10pfu \nBegin Time: 2026 Sep 05 1615 UTC\nNoaa Scale: S1 - Minor\nComment: \n\nNOAA Scale: S1 - Minor",
  },
  {
    product_id: "TIIA",
    issue_datetime: "2026-09-04 20:06:40.117",
    message: "Space Weather Message Code: ALTTP2\nSerial Number: 1528\nIssue Time: 2026 Sep 04 2006 UTC\n\nALERT: Type II Radio Emission \nBegin Time: 2026 Sep 04 1922 UTC\nEstimate Velocity: 698 km/s\nComment: ",
  },
];

test("normalizeSwpcAlert: each fixture entry normalizes to IngestBody", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body, `should normalize entry ${entry.product_id}`);
    assert.strictEqual(body.type, "space_weather");
    assert.strictEqual(body.source, "swpc");
    assert.strictEqual(body.upstream_id, `${entry.product_id}:${entry.issue_datetime}`);
  }
});

test("normalizeSwpcAlert: normalized bodies pass validateIngest", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    const error = validateIngest(body);
    assert.strictEqual(error, null, `body for ${entry.product_id} should validate: ${error}`);
  }
});

test("normalizeSwpcAlert: time is YYYY-MM-DDTHH:MM:SSZ (RFC 3339)", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    const timeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    assert.match(body.time, timeRegex, `time ${body.time} should match RFC 3339`);
  }
});

test("normalizeSwpcAlert: time converts space-separated input correctly", () => {
  const entry = fixture[0]; // "2026-09-24 09:52:18.960"
  const body = normalizeSwpcAlert(entry);
  assert.ok(body);
  assert.strictEqual(body.time, "2026-09-24T09:52:18Z");
});

test("normalizeSwpcAlert: upstream_id is product_id:issue_datetime", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    assert.strictEqual(body.upstream_id, `${entry.product_id}:${entry.issue_datetime}`);
  }
});

test("normalizeSwpcAlert: K-index alert extracts magnitude and mag_kind", () => {
  const k04 = fixture.find((e) => e.product_id === "K04A");
  assert.ok(k04);
  const body = normalizeSwpcAlert(k04);
  assert.ok(body);
  assert.strictEqual(body.magnitude, 4, "K04A should have magnitude 4");
  assert.strictEqual(body.mag_kind, "Kp", "K-index should have mag_kind 'Kp'");
});

test("normalizeSwpcAlert: K-index of 5 extracts magnitude correctly", () => {
  const k05 = fixture.find((e) => e.product_id === "K05A");
  assert.ok(k05);
  const body = normalizeSwpcAlert(k05);
  assert.ok(body);
  assert.strictEqual(body.magnitude, 5, "K05A should have magnitude 5");
  assert.strictEqual(body.mag_kind, "Kp");
});

test("normalizeSwpcAlert: G-scale watch extracts magnitude and mag_kind", () => {
  const g1 = fixture.find((e) => e.product_id === "A20F");
  assert.ok(g1);
  const body = normalizeSwpcAlert(g1);
  assert.ok(body);
  assert.strictEqual(body.magnitude, 1, "G1 watch should have magnitude 1");
  assert.strictEqual(body.mag_kind, "G", "G-scale should have mag_kind 'G'");
});

test("normalizeSwpcAlert: G-scale of 2 extracts magnitude correctly", () => {
  const g2 = fixture.find((e) => e.product_id === "A30F");
  assert.ok(g2);
  const body = normalizeSwpcAlert(g2);
  assert.ok(body);
  assert.strictEqual(body.magnitude, 2, "G2 watch should have magnitude 2");
  assert.strictEqual(body.mag_kind, "G");
});

test("normalizeSwpcAlert: S-scale (proton event) extracts magnitude and mag_kind", () => {
  const s1 = fixture.find((e) => e.product_id === "P11A");
  assert.ok(s1);
  const body = normalizeSwpcAlert(s1);
  assert.ok(body);
  assert.strictEqual(body.magnitude, 1, "S1 proton event should have magnitude 1");
  assert.strictEqual(body.mag_kind, "S", "S-scale should have mag_kind 'S'");
});

test("normalizeSwpcAlert: message with no magnitude gives null magnitude", () => {
  const typeII = fixture.find((e) => e.product_id === "TIIA");
  assert.ok(typeII);
  const body = normalizeSwpcAlert(typeII);
  assert.ok(body);
  assert.strictEqual(body.magnitude, null, "Type II radio alert should have no magnitude");
  assert.strictEqual(body.mag_kind, null, "Type II radio alert should have no mag_kind");
});

test("normalizeSwpcAlert: title is first meaningful line after headers", () => {
  const k04a = fixture.find((e) => e.product_id === "K04A");
  assert.ok(k04a);
  const body = normalizeSwpcAlert(k04a);
  assert.ok(body);
  assert.strictEqual(body.title, "ALERT: Geomagnetic K-index of 4");
});

test("normalizeSwpcAlert: title is max 120 chars", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    assert.ok(body.title.length <= 120, `title should be <= 120 chars, got ${body.title.length}`);
  }
});

test("normalizeSwpcAlert: geo is null (space_weather not a located type)", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    assert.strictEqual(body.geo, null, "space_weather events should not have geo");
  }
});

test("normalizeSwpcAlert: sky is null (space_weather not a located type)", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    assert.strictEqual(body.sky, null, "space_weather events should not have sky");
  }
});

test("normalizeSwpcAlert: payload is entry verbatim", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    assert.deepStrictEqual(body.payload, entry);
  }
});

test("normalizeSwpcAlert: upstream_url is SWPC alerts page", () => {
  for (const entry of fixture) {
    const body = normalizeSwpcAlert(entry);
    assert.ok(body);
    assert.strictEqual(
      body.upstream_url,
      "https://www.swpc.noaa.gov/products/alerts-watches-and-warnings"
    );
  }
});

test("normalizeSwpcAlert: missing product_id returns null", () => {
  const noId = {
    issue_datetime: "2026-09-24 09:52:18.960",
    message: "Some message",
  };
  const body = normalizeSwpcAlert(noId);
  assert.strictEqual(body, null);
});

test("normalizeSwpcAlert: missing issue_datetime returns null", () => {
  const noTime = {
    product_id: "K04A",
    message: "Some message",
  };
  const body = normalizeSwpcAlert(noTime);
  assert.strictEqual(body, null);
});

test("normalizeSwpcAlert: missing message returns null", () => {
  const noMsg = {
    product_id: "K04A",
    issue_datetime: "2026-09-24 09:52:18.960",
  };
  const body = normalizeSwpcAlert(noMsg);
  assert.strictEqual(body, null);
});

test("normalizeSwpcAlert: invalid datetime format returns null", () => {
  const badTime = {
    product_id: "K04A",
    issue_datetime: "not-a-date",
    message: "Some message",
  };
  const body = normalizeSwpcAlert(badTime);
  assert.strictEqual(body, null);
});

test("normalizeSwpcFeed: maps array and drops nulls", () => {
  const bodies = normalizeSwpcFeed(fixture);
  assert.strictEqual(bodies.length, fixture.length);
  assert.ok(bodies.every((b) => b !== null && b.type === "space_weather"));
});

test("normalizeSwpcFeed: non-array returns empty array", () => {
  const bodies = normalizeSwpcFeed("not an array");
  assert.deepStrictEqual(bodies, []);
});

test("normalizeSwpcFeed: empty array returns empty", () => {
  const bodies = normalizeSwpcFeed([]);
  assert.deepStrictEqual(bodies, []);
});

test("fetchSwpc with stubbed fetchFn returns normalized events", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const bodies = await fetchSwpc(stubFetch);
  assert.strictEqual(bodies.length, fixture.length);
  assert.ok(bodies.every((b) => b.type === "space_weather"));
  assert.ok(bodies.every((b) => b.source === "swpc"));
});

test("fetchSwpc throws on non-ok response", async () => {
  const stubFetch = async () => {
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(
    async () => {
      await fetchSwpc(stubFetch);
    },
    (err) => {
      return err instanceof Error && err.message.includes("status 500");
    }
  );
});

test("fetchSwpc includes USER_AGENT header", async () => {
  let userAgentSent = "";
  const stubFetch = async (url, options) => {
    if (options && options.headers && options.headers["user-agent"]) {
      userAgentSent = options.headers["user-agent"];
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await fetchSwpc(stubFetch);
  assert.ok(userAgentSent.includes("planetlog"), "USER_AGENT should be included");
});
