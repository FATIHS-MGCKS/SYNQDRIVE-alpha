import { describe, expect, it } from 'vitest';
import { mapEvaluationsResult } from './evaluations-analytics-client';
import type { RequestResult } from '../../../lib/api';
import {
  evaluationsQueryKey,
  evaluationsQueryKeyString,
} from './evaluations-query-keys';
import { EVALUATIONS_FINANCE_PERIOD_AUTHORITY, isAvailable } from './evaluations-request';
import type { EvaluationsDriverInfluenceSection } from './evaluations-canonical.types';

describe('E6A result mapping — feature/HTTP states distinct from metric states', () => {
  it('ok+data → AVAILABLE', () => {
    const r = mapEvaluationsResult({ ok: true, status: 200, data: { x: 1 } } as RequestResult<{ x: number }>);
    expect(r.state).toBe('AVAILABLE');
    if (isAvailable(r)) expect(r.data.x).toBe(1);
  });

  it('404 → FEATURE_DISABLED (never empty/zero/healthy data)', () => {
    const r = mapEvaluationsResult({ ok: false, status: 404, errorMessage: 'Not found' } as RequestResult<unknown>);
    expect(r.state).toBe('FEATURE_DISABLED');
    expect((r as Record<string, unknown>).data).toBeUndefined();
  });

  it('403 → UNAUTHORIZED', () => {
    const r = mapEvaluationsResult({ ok: false, status: 403, errorMessage: 'Forbidden' } as RequestResult<unknown>);
    expect(r.state).toBe('UNAUTHORIZED');
  });

  it('500 / network → ERROR (distinct from metric UNAVAILABLE)', () => {
    expect(mapEvaluationsResult({ ok: false, status: 500, errorMessage: 'x' } as RequestResult<unknown>).state).toBe('ERROR');
    expect(mapEvaluationsResult({ ok: false, status: 0, errorMessage: 'net' } as RequestResult<unknown>).state).toBe('ERROR');
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

  it('capability is part of the key (summary vs quality vs driver)', () => {
    expect(evaluationsQueryKeyString('insights-summary', org)).not.toBe(
      evaluationsQueryKeyString('quality', org),
    );
    expect(evaluationsQueryKeyString('quality', org)).not.toBe(
      evaluationsQueryKeyString('driver-analysis', org),
    );
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
