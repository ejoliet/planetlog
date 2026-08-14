// JCS (RFC 8785) canonicalization — mirror of worker/src/envelope.ts canonicalize().
export function canonicalize(v) {
  if (v === undefined) throw new Error("cannot canonicalize undefined");
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return "[" + v.map((x) => canonicalize(x === undefined ? null : x)).join(",") + "]";
  }
  const parts = [];
  for (const k of Object.keys(v).sort()) {
    if (v[k] === undefined) continue;
    parts.push(JSON.stringify(k) + ":" + canonicalize(v[k]));
  }
  return "{" + parts.join(",") + "}";
}
