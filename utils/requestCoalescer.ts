/**
 * In-flight request coalescer.
 *
 * Usage:
 *   const data = await coalesce(`recalls:${userId}:page:${pageNum}`, () => supabase.from(...).select(...));
 *
 * If a request with the same key is already in flight, the second caller awaits
 * the same Promise instead of starting a new one. The Promise is removed from
 * the map when it settles.
 *
 * Keep keys deterministic and scoped (user id, table, filter). Do NOT use this
 * as a cache — it only de-duplicates concurrent in-flight reads.
 */

const inFlight = new Map<string, Promise<unknown>>();

export function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = fn().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, p);
  return p;
}

export function coalescerSize(): number {
  return inFlight.size;
}
