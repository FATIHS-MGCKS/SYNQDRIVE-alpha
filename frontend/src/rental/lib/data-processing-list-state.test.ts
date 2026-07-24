import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTION_FILTERS,
  hasActiveFilters,
  kpiToLegacyParams,
  kpiToRegisterParams,
} from './data-processing-list-state';

describe('data-processing-list-state', () => {
  it('maps activity KPIs to register query params', () => {
    expect(kpiToRegisterParams('active_activities')).toEqual({ kpiFilter: 'active' });
    expect(kpiToRegisterParams('blocking_gaps')).toEqual({ kpiFilter: 'blocking_gaps' });
    expect(kpiToRegisterParams('reviews_due')).toEqual({ kpiFilter: 'review_due' });
    expect(kpiToRegisterParams('revocations_in_progress')).toEqual({
      kpiFilter: 'revocations_in_progress',
    });
    expect(kpiToRegisterParams('dpia_overdue')).toEqual({ kpiFilter: 'dpia_overdue' });
  });

  it('maps legacy KPIs to authorization list params', () => {
    expect(kpiToLegacyParams('legacy_active')).toEqual({ status: 'ACTIVE' });
    expect(kpiToLegacyParams('legacy_expiring_soon')).toEqual({ expiringSoon: true });
    expect(kpiToLegacyParams('legacy_revoked_expired')).toEqual({ revokedOrExpired: true });
    expect(kpiToLegacyParams('legacy_high_risk')).toEqual({ riskLevel: 'HIGH' });
    expect(kpiToLegacyParams('revocations_in_progress')).toEqual({
      revocationInProgress: true,
    });
  });

  it('detects active filters', () => {
    expect(hasActiveFilters(DEFAULT_SECTION_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_SECTION_FILTERS, kpi: 'blocking_gaps' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_SECTION_FILTERS, q: 'fleet' })).toBe(true);
  });
});
