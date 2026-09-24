#!/usr/bin/env bash
# planetlog smoke test — proves the acceptance criteria locally:
#   1. fixture quake -> /ingest -> visible on `planet tail` in < 2 s
#   2. duplicate ingest -> 409, not re-broadcast
#   3. materially changed re-ingest -> revision 2, supersedes rev 1; /events shows latest only
#   4. `planet verify` validates the signed event against /pubkey
#   5. cron poller (USGS all_hour) runs via /__scheduled and ingests real events (needs network)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8787}"
URL="http://127.0.0.1:$PORT"
WORK="${SMOKE_TMP:-$(mktemp -d)}"

fail() { echo "SMOKE FAIL: $1" >&2; [ -f "$WORK/wrangler.log" ] && tail -30 "$WORK/wrangler.log" >&2; exit 1; }

# dev key + token
[ -f "$ROOT/worker/.dev.vars" ] || node "$ROOT/scripts/keygen.mjs" >/dev/null
TOKEN="$(grep '^INGEST_TOKEN=' "$ROOT/worker/.dev.vars" | cut -d= -f2)"

# unique upstream_id per run so re-runs don't hit the persisted dedupe
RUN_ID="spike$(date +%s)"
node -e '
  const fs = require("fs");
  const fx = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  fx.upstream_id = process.argv[3];
  fx.upstream_url = fx.upstream_url.replace(/us7000spike/, process.argv[3]);
  fs.writeFileSync(process.argv[2], JSON.stringify(fx));
  // revised copy: USGS bumped the magnitude
  fx.magnitude = 6.9;
  fx.title = fx.title.replace("M 6.2", "M 6.9");
  fx.payload.properties.mag = 6.9;
  fs.writeFileSync(process.argv[2].replace(/\.json$/, ".rev.json"), JSON.stringify(fx));
' "$ROOT/fixtures/usgs-quake.json" "$WORK/fixture.json" "$RUN_ID"

post() { curl -s -o "$2" -w '%{http_code}' -X POST "$URL/ingest" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data @"$1"; }

# start worker
cd "$ROOT/worker"
npx wrangler dev --port "$PORT" --test-scheduled >"$WORK/wrangler.log" 2>&1 &
WPID=$!
TPID=""
cleanup() { [ -n "$TPID" ] && kill "$TPID" 2>/dev/null; kill "$WPID" 2>/dev/null; wait 2>/dev/null; }
trap cleanup EXIT

for _ in $(seq 1 120); do
  curl -sf "$URL/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "$URL/health" >/dev/null || fail "worker did not come up on $URL"
echo "worker up: $URL"

# start tail before ingest
node "$ROOT/cli/src/main.mjs" tail --json --url "$URL" >"$WORK/tail.ndjson" 2>/dev/null &
TPID=$!
sleep 1

# 1. ingest fixture -> 202
CODE=$(post "$WORK/fixture.json" "$WORK/ingest.json")
[ "$CODE" = "202" ] || fail "ingest expected 202, got $CODE: $(cat "$WORK/ingest.json")"
ID1=$(node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id' <"$WORK/ingest.json")
echo "ingest 202: $(cat "$WORK/ingest.json")"

# visible on tail < 2 s
SEEN=""
for _ in $(seq 1 20); do
  grep -q "$RUN_ID" "$WORK/tail.ndjson" 2>/dev/null && SEEN=1 && break
  sleep 0.1
done
[ -n "$SEEN" ] || fail "event not on SSE tail within 2 s"
echo "tail saw event < 2 s"

# 2. duplicate -> 409, no second broadcast
CODE=$(post "$WORK/fixture.json" /dev/null)
[ "$CODE" = "409" ] || fail "duplicate expected 409, got $CODE"
sleep 0.5
N=$(grep -c "$RUN_ID" "$WORK/tail.ndjson")
[ "$N" = "1" ] || fail "duplicate was re-broadcast ($N tail lines)"
echo "duplicate 409, not re-broadcast"

# 3. revised event -> 202 revision 2, supersedes rev 1, broadcast; /events latest-only by default
CODE=$(post "$WORK/fixture.rev.json" "$WORK/ingest2.json")
[ "$CODE" = "202" ] || fail "revision expected 202, got $CODE: $(cat "$WORK/ingest2.json")"
node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (r.revision !== 2) throw new Error("expected revision 2, got " + JSON.stringify(r));
  if (r.supersedes !== process.argv[2]) throw new Error("expected supersedes " + process.argv[2] + ", got " + JSON.stringify(r));
' "$WORK/ingest2.json" "$ID1" || fail "revision response wrong"
sleep 0.5
N=$(grep -c "$RUN_ID" "$WORK/tail.ndjson")
[ "$N" = "2" ] || fail "revision not broadcast ($N tail lines)"
N=$(curl -s "$URL/events?limit=500" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).events.filter(e=>e.upstream_id===process.argv[1]).length' "$RUN_ID")
[ "$N" = "1" ] || fail "/events should show latest revision only, got $N"
N=$(curl -s "$URL/events?limit=500&all=1" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).events.filter(e=>e.upstream_id===process.argv[1]).length' "$RUN_ID")
[ "$N" = "2" ] || fail "/events?all=1 should show both revisions, got $N"
echo "revision 2 supersedes $ID1; /events latest-only, ?all=1 shows both"

# unauthorized -> 401
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/ingest" \
  -H 'content-type: application/json' --data @"$WORK/fixture.json")
[ "$CODE" = "401" ] || fail "no-token ingest expected 401, got $CODE"
echo "no token -> 401"

# 4. verify signature against /pubkey (both revisions)
grep "$RUN_ID" "$WORK/tail.ndjson" | head -1 >"$WORK/event.json"
node "$ROOT/cli/src/main.mjs" verify "$WORK/event.json" --url "$URL" || fail "signature verification failed (rev 1)"
grep "$RUN_ID" "$WORK/tail.ndjson" | tail -1 >"$WORK/event2.json"
node "$ROOT/cli/src/main.mjs" verify "$WORK/event2.json" --url "$URL" || fail "signature verification failed (rev 2)"
node -e 'const e=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if (e.prev_magnitude!==6.2||e.magnitude!==6.9) throw new Error(JSON.stringify(e))' "$WORK/event2.json" || fail "rev 2 should carry prev_magnitude 6.2"
echo "rev 2 carries prev_magnitude 6.2 -> 6.9"

# 5. cron poller: trigger the scheduled handler, expect a usgs summary line with no errors
curl -sf "$URL/__scheduled?cron=*+*+*+*+*" >/dev/null || fail "/__scheduled trigger failed"
LINE=""
for _ in $(seq 1 100); do
  LINE=$(grep -o '{"feed":"usgs"[^}]*}' "$WORK/wrangler.log" | tail -1 || true)
  [ -n "$LINE" ] && break
  sleep 0.2
done
if [ -z "$LINE" ]; then
  if [ "${SMOKE_NET:-0}" = "1" ]; then fail "poller produced no usgs summary (network?)"; fi
  echo "poller: no summary within 20 s — skipped (set SMOKE_NET=1 to require network)"
else
  echo "poller: $LINE"
  node -e 'const r=JSON.parse(process.argv[1]); if (r.error>0||r.fetched===0) process.exit(1)' "$LINE" || fail "poller reported errors or fetched nothing"
fi

# human-format log for the eyeball check
echo "--- planet log ---"
node "$ROOT/cli/src/main.mjs" log --url "$URL" --limit 8 --min-mag 0
echo "SMOKE PASS ($WORK)"
