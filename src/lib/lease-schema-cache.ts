// In-memory cache of in-flight schema extractions keyed by blob URL.
// When pre-review uploads a template, it kicks off extractLeaseSchema in the
// background and stores the promise here. The preview route can then await
// the same promise instead of re-running extraction. The entry is cleared
// after a fixed TTL so the cache never grows unbounded.

import type { ExtractedLeaseSchema } from "./fill-lease";

type Entry = {
  promise: Promise<ExtractedLeaseSchema | null>;
  startedAt: number;
};

const cache = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function sweep() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.startedAt > TTL_MS) cache.delete(key);
  }
}

export function registerSchemaExtraction(
  blobUrl: string,
  promise: Promise<ExtractedLeaseSchema | null>,
): void {
  sweep();
  cache.set(blobUrl, { promise, startedAt: Date.now() });
}

export function getSchemaExtraction(blobUrl: string): Promise<ExtractedLeaseSchema | null> | null {
  sweep();
  return cache.get(blobUrl)?.promise ?? null;
}

export function clearSchemaExtraction(blobUrl: string): void {
  cache.delete(blobUrl);
}
