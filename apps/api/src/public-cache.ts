import type { Context } from 'hono';
import type { Env, Variables } from './types';

interface CacheEnvironment {
  Bindings: Env;
  Variables: Variables;
}

const cacheOrigin = 'https://public-cache.velora.internal';
const cacheVersion = 'v1';
const cacheName = 'velora-public-v1';
const fixedDiscoveryKeys = ['tags', 'trending'] as const;

export interface PublicCacheResult<T> {
  readonly value: T;
  readonly status: 'HIT' | 'MISS';
}

export async function readThroughPublicCache<T>(
  context: Context<CacheEnvironment>,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T> | T,
): Promise<PublicCacheResult<T>> {
  // The Cache API exists in workerd but not in plain Node/Vitest. A cache outage must degrade to
  // the authoritative loader instead of turning a public read into a 500 response.
  if (typeof caches === 'undefined') {
    return { value: await loader(), status: 'MISS' };
  }
  const cache = await caches.open(cacheName);
  const request = publicCacheRequest(key);
  const cached = await cache.match(request);
  if (cached) {
    try {
      return { value: (await cached.json()) as T, status: 'HIT' };
    } catch {
      context.executionCtx.waitUntil(cache.delete(request));
    }
  }
  const value = await loader();
  const response = new Response(JSON.stringify(value), {
    headers: {
      'cache-control': `public, max-age=${String(ttlSeconds)}`,
      'content-type': 'application/json; charset=UTF-8',
    },
  });
  context.executionCtx.waitUntil(cache.put(request, response));
  return { value, status: 'MISS' };
}

export function invalidatePublicDiscovery(
  context: Context<CacheEnvironment>,
  characterId?: string,
): void {
  if (typeof caches === 'undefined') return;
  const keys: string[] = [...fixedDiscoveryKeys];
  if (characterId) keys.push(`character/${encodeURIComponent(characterId)}`);
  context.executionCtx.waitUntil(
    caches.open(cacheName).then(async (cache) => {
      await Promise.all(keys.map((key) => cache.delete(publicCacheRequest(key))));
    }),
  );
}

export function publicCacheRequest(key: string): Request {
  const normalized = key.replace(/^\/+|\/+$/gu, '');
  if (!normalized || normalized.includes('..')) throw new Error('Invalid public cache key.');
  return new Request(`${cacheOrigin}/${cacheVersion}/${normalized}`, { method: 'GET' });
}
