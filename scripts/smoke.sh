#!/usr/bin/env bash
# planetlog spike smoke test — proves the acceptance criteria locally:
#   1. fixture quake -> /ingest -> visible on `planet tail` in < 2 s
#   2. duplicate ingest -> 409, not re-broadcast
#   3. `planet verify` validates the signed event against /pubkey
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
' "$ROOT/fixtures/usgs-quake.json" "$WORK/fixture.json" "$RUN_ID"

# start worker
cd "$ROOT/worker"
npx wrangler dev --port "$PORT" >"$WORK/wrangler.log" 2>&1 &
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
CODE=$(curl -s -o "$WORK/ingest.json" -w '%{http_code}' -X POST "$URL/ingest" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  --data @"$WORK/fixture.json")
[ "$CODE" = "202" ] || fail "ingest expected 202, got $CODE: $(cat "$WORK/ingest.json")"
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
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/ingest" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  --data @"$WORK/fixture.json")
[ "$CODE" = "409" ] || fail "duplicate expected 409, got $CODE"
sleep 0.5
N=$(grep -c "$RUN_ID" "$WORK/tail.ndjson")
[ "$N" = "1" ] || fail "duplicate was re-broadcast ($N tail lines)"
echo "duplicate 409, not re-broadcast"

# unauthorized -> 401
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/ingest" \
  -H 'content-type: application/json' --data @"$WORK/fixture.json")
[ "$CODE" = "401" ] || fail "no-token ingest expected 401, got $CODE"
echo "no token -> 401"

# 3. verify signature against /pubkey
grep "$RUN_ID" "$WORK/tail.ndjson" | head -1 >"$WORK/event.json"
node "$ROOT/cli/src/main.mjs" verify "$WORK/event.json" --url "$URL" || fail "signature verification failed"

# human-format log for the eyeball check
echo "--- planet log ---"
node "$ROOT/cli/src/main.mjs" log --url "$URL" --limit 5
echo "SMOKE PASS ($WORK)"
