// planet status — per-feed poller health from /health.
const TTY = process.stdout.isTTY;
const c = (code, s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);

function ago(iso) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export async function status(args) {
  const res = await fetch(`${args.url}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const h = await res.json();
  if (args.json) return console.log(JSON.stringify(h));
  console.log(`${h.ok ? c("32", "OK") : c("31", "DEGRADED")}  ${args.url}  sse clients: ${h.sse_clients}`);
  if (h.feeds.length === 0) return console.log("no feeds have polled yet");
  console.log(["feed".padEnd(9), "every".padEnd(6), "last ok".padEnd(9), "events".padStart(7), "  status"].join(" "));
  for (const f of h.feeds) {
    const st = f.stale ? c("31", "STALE") : c("32", "ok");
    const err = f.last_error ? c("2", `  ${f.last_error.slice(0, 60)}`) : "";
    console.log(
      [f.name.padEnd(9), `${f.every_minutes}m`.padEnd(6), ago(f.last_ok).padEnd(9), String(f.events).padStart(7), `  ${st}${err}`].join(" "),
    );
  }
  if (!h.ok) process.exitCode = 1;
}
