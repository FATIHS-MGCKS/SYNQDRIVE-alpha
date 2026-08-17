import { describe, expect, it } from 'vitest';
import { mapEvaluationsResult } from './evaluations-analytics-client';
import type { RequestResult } from '../../../lib/api';
import {
  evaluationsQueryKey,
  evaluationsQueryKeyString,
} from './evaluations-query-keys';
import {
  EVALUATIONS_FINANCE_PERIOD_AUTHORITY,
  isAvailable,
  orgFetchState,
  shouldApplyResponse,
  settledResult,
} from './evaluations-request';
import type { EvaluationsDriverInfluenceSection } from './evaluations-canonical.types';

describe('E6A.1 result mapping — HTTP/feature states distinct; 404 is neutral', () => {
  it('ok+data → AVAILABLE', () => {
    const r = mapEvaluationsResult({ ok: true, status: 200, data: { x: 1 } } as RequestResult<{ x: number }>);
    expect(r.state).toBe('AVAILABLE');
    if (isAvailable(r)) expect(r.data.x).toBe(1);
  });

  it('403 → UNAUTHORIZED', () => {
    const r = mapEvaluationsResult({ ok: false, status: 403, errorMessage: 'Forbidden' } as RequestResult<unknown>);
    expect(r.state).toBe('UNAUTHORIZED');
  });

  it('generic 404 → NOT_FOUND (NEVER auto FEATURE_DISABLED, never empty/zero data)', () => {
    const r = mapEvaluationsResult({ ok: false, status: 404, errorMessage: 'Not found' } as RequestResult<unknown>);
    expect(r.state).toBe('NOT_FOUND');
    expect(r.state).not.toBe('FEATURE_DISABLED');
    expect((r as Record<string, unknown>).data).toBeUndefined();
  });

  it('the mapper never emits FEATURE_DISABLED (no reliable discriminator on current main)', () => {
    const statuses = [200, 403, 404, 500, 0];
    for (const status of statuses) {
      const r = mapEvaluationsResult(
        (status === 200
          ? { ok: true, status, data: {} }
          : { ok: false, status, errorMessage: 'x' }) as RequestResult<unknown>,
      );
      expect(r.state).not.toBe('FEATURE_DISABLED');
    }
  });

  it('500 / network → ERROR (distinct from metric UNAVAILABLE and from NOT_FOUND)', () => {
    expect(mapEvaluationsResult({ ok: false, status: 500, errorMessage: 'x' } as RequestResult<unknown>).state).toBe('ERROR');
    expect(mapEvaluationsResult({ ok: false, status: 0, errorMessage: 'net' } as RequestResult<unknown>).state).toBe('ERROR');
  });
});

describe('E6A.1 organization lifecycle + race safety (pure helpers used by the hooks)', () => {
  it('no organization → IDLE (no request, no permanent loading, no stale data)', () => {
    expect(orgFetchState(null).phase).toBe('IDLE');
    expect(orgFetchState(undefined).phase).toBe('IDLE');
    expect(orgFetchState('').phase).toBe('IDLE');
  });

  it('organization present → LOADING (fresh fetch replaces prior-org data)', () => {
    expect(orgFetchState('org-a').phase).toBe('LOADING');
    expect(orgFetchState('org-b').phase).toBe('LOADING');
  });

  it('race guard: only a response for the currently active scope key is applied', () => {
    // org A response arriving after switching to org B is discarded.
    expect(shouldApplyResponse('evaluations|insights-summary|org-b|MTD|all', 'evaluations|insights-summary|org-a|MTD|all')).toBe(false);
    // matching scope → applied.
    expect(shouldApplyResponse('k', 'k')).toBe(true);
    // no active scope (e.g. org removed) → never apply a stale response.
    expect(shouldApplyResponse(null, 'k')).toBe(false);
    // period/station scope change is also guarded (different keys).
    expect(shouldApplyResponse('evaluations|quality|org-a|YEAR|all', 'evaluations|quality|org-a|MTD|all')).toBe(false);
  });

  it('settledResult returns the result only when SETTLED', () => {
    expect(settledResult({ phase: 'IDLE' })).toBeNull();
    expect(settledResult({ phase: 'LOADING' })).toBeNull();
    expect(settledResult({ phase: 'SETTLED', result: { state: 'NOT_FOUND' } })?.state).toBe('NOT_FOUND');
  });
});

describe('E6A query keys — scope-safe + deterministic + finance MTD', () => {
  const org = 'org-a';

  it('distinct period → distinct key', () => {
    const a = evaluationsQueryKeyString('insights-summary', org, { periodType: 'MTD' });
    const b = evaluationsQueryKeyString('insights-summary', org, { periodType: 'YEAR' });
    expect(a).not.toBe(b);
  });

  it('distinct station scope → distinct key; station order is normalized', () => {
    const a = evaluationsQueryKeyString('insights-summary', org, { stationIds: ['s1', 's2'] });
    const b = evaluationsQueryKeyString('insights-summary', org, { stationIds: ['s2', 's1'] });
    const c = evaluationsQueryKeyString('insights-summary', org, { stationIds: ['s3'] });
    expect(a).toBe(b); // same set, different order → same key (dedup)
    expect(a).not.toBe(c);
  });

  it('all-stations (null) vs no-stations ([]) are distinct', () => {
    const all = evaluationsQueryKeyString('insights-summary', org, { stationIds: null });
    const none = evaluationsQueryKeyString('insights-summary', org, { stationIds: [] });
    expect(all).not.toBe(none);
  });

  it('different orgs never collide', () => {
    const a = evaluationsQueryKeyString('insights-summary', 'org-a', { periodType: 'MTD' });
    const b = evaluationsQueryKeyString('insights-summary', 'org-b', { periodType: 'MTD' });
    expect(a).not.toBe(b);
  });

  it('same inputs dedupe to the same key', () => {
    const a = evaluationsQueryKeyString('quality', org, { periodType: 'MTD', stationIds: ['s1'] });
    const b = evaluationsQueryKeyString('quality', org, { periodType: 'MTD', stationIds: ['s1'] });
    expect(a).toBe(b);
  });

  it('finance key ignores periodType (E3 fixed MTD)', () => {
    const a = evaluationsQueryKey('finance', org, { periodType: 'MTD' });
    const b = evaluationsQueryKey('finance', org, { periodType: 'YEAR' });
    expect(a).toEqual(b);
    expect(a[3]).toBe('MTD');
    expect(EVALUATIONS_FINANCE_PERIOD_AUTHORITY).toBe('MTD');
  });

  it('capability is part of the key (summary vs quality vs driver vs recommendations)', () => {
    expect(evaluationsQueryKeyString('insights-summary', org)).not.toBe(
      evaluationsQueryKeyString('quality', org),
    );
    expect(evaluationsQueryKeyString('quality', org)).not.toBe(
      evaluationsQueryKeyString('driver-analysis', org),
    );
    expect(evaluationsQueryKeyString('recommendations', org, { periodType: 'MTD' })).not.toBe(
      evaluationsQueryKeyString('finance', org, { periodType: 'MTD' }),
    );
  });

  it('recommendations key is period-aware (unlike finance MTD lock)', () => {
    const mtd = evaluationsQueryKeyString('recommendations', org, { periodType: 'MTD' });
    const rolling = evaluationsQueryKeyString('recommendations', org, { periodType: 'ROLLING_30_DAYS' });
    expect(mtd).not.toBe(rolling);
  });

  it('recommendations station order is stable', () => {
    const ab = evaluationsQueryKeyString('recommendations', org, { stationIds: ['a', 'b'], periodType: 'MTD' });
    const ba = evaluationsQueryKeyString('recommendations', org, { stationIds: ['b', 'a'], periodType: 'MTD' });
    expect(ab).toBe(ba);
  });
});

describe('E6A driver-influence transport — server tier preserved, no client identity', () => {
  function section(piiTier: 'full' | 'pseudonymous' | 'none', driverRef: string): EvaluationsDriverInfluenceSection {
    return {
      status: piiTier === 'none' ? 'UNAVAILABLE' : 'AVAILABLE',
      calculationVersion: 'driver-influence-e4-v1',
      period: {} as never,
      scope: { organizationId: 'org-a', stationIds: null, stationScoped: false },
      coverage: null,
      generatedAt: '2026-01-01T00:00:00.000Z',
      reason: piiTier === 'none' ? 'PERSON_LEVEL_ACCESS_DENIED' : null,
      disclaimer: 'assoc only',
      confounders: [],
      piiTier,
      factors: piiTier === 'none' ? [] : [
        { driverRef, associatedDimension: 'BOOKING_CANCELLATIONS', associationShare: 1, sampleSize: 5, relationship: 'ASSOCIATED_WITH' },
      ],
    };
  }

  it('mapping preserves piiTier=full and the server driverRef verbatim', () => {
    const r = mapEvaluationsResult({ ok: true, status: 200, data: section('full', 'driver-a') } as RequestResult<EvaluationsDriverInfluenceSection>);
    expect(isAvailable(r)).toBe(true);
    if (isAvailable(r)) {
      expect(r.data.piiTier).toBe('full');
      expect(r.data.factors[0].driverRef).toBe('driver-a');
    }
  });

  it('preserves pseudonymous server driverRef exactly (no local resolution)', () => {
    const r = mapEvaluationsResult({ ok: true, status: 200, data: section('pseudonymous', 'person-v1-abc123') } as RequestResult<EvaluationsDriverInfluenceSection>);
    if (isAvailable(r)) {
      expect(r.data.piiTier).toBe('pseudonymous');
      expect(r.data.factors[0].driverRef).toBe('person-v1-abc123');
    }
  });

  it('piiTier=none carries no factors (server denied person-level access)', () => {
    const r = mapEvaluationsResult({ ok: true, status: 200, data: section('none', '') } as RequestResult<EvaluationsDriverInfluenceSection>);
    if (isAvailable(r)) {
      expect(r.data.piiTier).toBe('none');
      expect(r.data.factors).toEqual([]);
      expect(r.data.status).toBe('UNAVAILABLE');
    }
  });
});
