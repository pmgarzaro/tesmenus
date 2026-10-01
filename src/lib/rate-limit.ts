// In-memory attempt counter (one server instance): slows down password guessing.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Records an attempt. Returns the minutes to wait if over the limit, else 0. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): number {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  b.count++;
  return b.count > limit ? Math.ceil((b.resetAt - now) / 60_000) : 0;
}

export function reset(key: string) {
  buckets.delete(key);
}

// Keep memory bounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 10 * 60_000).unref?.();
