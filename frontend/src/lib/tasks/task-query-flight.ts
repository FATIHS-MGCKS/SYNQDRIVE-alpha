/**
 * In-flight deduplication and org-scoped cancellation for task list/summary fetches.
 * Prevents duplicate parallel requests for the same query key within one org scope.
 */

export function serializeTaskQueryKey(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

interface InFlightEntry<T> {
  orgId: string;
  generation: number;
  promise: Promise<T>;
}

const orgGeneration = new Map<string, number>();
const inFlight = new Map<string, InFlightEntry<unknown>>();

export function bumpTaskQueryOrgGeneration(orgId: string): number {
  const next = (orgGeneration.get(orgId) ?? 0) + 1;
  orgGeneration.set(orgId, next);
  for (const [key, entry] of [...inFlight.entries()]) {
    if (entry.orgId === orgId) inFlight.delete(key);
  }
  return next;
}

export function getTaskQueryOrgGeneration(orgId: string): number {
  return orgGeneration.get(orgId) ?? 0;
}

export function clearTaskQueryFlightForOrg(orgId: string): void {
  bumpTaskQueryOrgGeneration(orgId);
}

export async function runTaskQueryFlight<T>(options: {
  queryKey: readonly unknown[];
  orgId: string;
  generation: number;
  fetcher: () => Promise<T>;
}): Promise<T> {
  const { queryKey, orgId, generation, fetcher } = options;
  const key = serializeTaskQueryKey(queryKey);

  if (isTaskQueryGenerationStale(orgId, generation)) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  const existing = inFlight.get(key);
  if (existing && existing.orgId === orgId && existing.generation === generation) {
    return existing.promise as Promise<T>;
  }

  const promise = (async () => {
    if (isTaskQueryGenerationStale(orgId, generation)) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const result = await fetcher();
    if (isTaskQueryGenerationStale(orgId, generation)) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return result;
  })().finally(() => {
    const current = inFlight.get(key);
    if (current?.promise === promise) inFlight.delete(key);
  });

  inFlight.set(key, { orgId, generation, promise });
  return promise;
}

export function isTaskQueryGenerationStale(orgId: string, generation: number): boolean {
  return getTaskQueryOrgGeneration(orgId) !== generation;
}
