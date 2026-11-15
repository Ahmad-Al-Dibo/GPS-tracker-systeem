// Kleine in-memory rate-limiter (single-node deployment, geen dependency).
// Bewust module-scope-per-instance: elke limiter houdt eigen buckets bij.
// Reset bij herstart — nginx limit_req vormt de productie-laag eroverheen.

type Bucket = { count: number; resetAt: number };

export type RateLimiter = {
  /** True als key het maximum in het huidige venster heeft bereikt. */
  isLimited: (key: string, max: number) => boolean;
  /** Poging tellen (mislukt of geslaagd — hangt af van de aanroeper). */
  record: (key: string) => void;
  /** Bij succesvolle actie: teller wissen. */
  clear: (key: string) => void;
};

export function createRateLimiter(windowMs: number): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function current(key: string): Bucket | undefined {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= Date.now()) return undefined;
    return bucket;
  }

  return {
    isLimited(key, max) {
      const bucket = current(key);
      return !!bucket && bucket.count >= max;
    },
    record(key) {
      const now = Date.now();
      const bucket = current(key);
      if (!bucket) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        // Geheugen begrenzen: verlopen buckets opruimen bij groei.
        if (buckets.size > 10_000) {
          for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
        }
        return;
      }
      bucket.count += 1;
    },
    clear(key) {
      buckets.delete(key);
    },
  };
}
