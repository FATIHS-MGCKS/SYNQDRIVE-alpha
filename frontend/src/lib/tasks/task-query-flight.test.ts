import { beforeEach, describe, expect, it } from 'vitest';
import {
  bumpTaskQueryOrgGeneration,
  getTaskQueryOrgGeneration,
  runTaskQueryFlight,
  serializeTaskQueryKey,
} from './task-query-flight';

describe('task-query-flight', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const key = ['tasks', orgA, 'list', 'bucket', 'NOW'] as const;

  beforeEach(() => {
    bumpTaskQueryOrgGeneration(orgA);
    bumpTaskQueryOrgGeneration(orgB);
  });

  it('deduplicates parallel requests for the same query key', async () => {
    const gen = getTaskQueryOrgGeneration(orgA);
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return ['task-1'];
    };

    const [a, b] = await Promise.all([
      runTaskQueryFlight({ queryKey: key, orgId: orgA, generation: gen, fetcher }),
      runTaskQueryFlight({ queryKey: key, orgId: orgA, generation: gen, fetcher }),
    ]);

    expect(calls).toBe(1);
    expect(a).toEqual(['task-1']);
    expect(b).toEqual(['task-1']);
  });

  it('invalidates in-flight dedup after org generation bump', async () => {
    const gen = getTaskQueryOrgGeneration(orgA);
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return 'ok';
    };

    const first = runTaskQueryFlight({ queryKey: key, orgId: orgA, generation: gen, fetcher });
    bumpTaskQueryOrgGeneration(orgA);
    const secondGen = getTaskQueryOrgGeneration(orgA);
    const second = runTaskQueryFlight({
      queryKey: key,
      orgId: orgA,
      generation: secondGen,
      fetcher,
    });

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toBe('ok');
    expect(calls).toBe(2);
  });

  it('serializes query keys deterministically', () => {
    expect(serializeTaskQueryKey(['tasks', orgA, 'summary'])).toBe(
      JSON.stringify(['tasks', orgA, 'summary']),
    );
  });
});
