// AIDEV-NOTE: spike ULID — crypto-random tail, no same-millisecond monotonic
// counter yet. Sufficient for ordering at spike traffic; harden before v0.1.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(now: number = Date.now()): string {
  let t = now;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = B32[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rand = crypto.getRandomValues(new Uint8Array(16));
  let tail = "";
  for (const byte of rand) tail += B32[byte % 32];
  return time + tail;
}
