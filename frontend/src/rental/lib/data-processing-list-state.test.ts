import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTION_FILTERS,
  hasActiveFilters,
  kpiToLegacyParams,
  kpiToRegisterParams,
  LEGACY_AUTHORIZATION_SORT_FIELDS,
  normalizeSectionSort,
  REGISTER_SORT_FIELDS,
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

  describe('normalizeSectionSort', () => {
    it('accepts the shared default sort on both endpoints', () => {
      expect(DEFAULT_SECTION_FILTERS.sort).toBe('updatedAt');
      expect(LEGACY_AUTHORIZATION_SORT_FIELDS).toContain('updatedAt');
      expect(REGISTER_SORT_FIELDS).toContain('updatedAt');
    });

    it('keeps a sort field the target endpoint supports', () => {
      expect(
        normalizeSectionSort('expiresAt', LEGACY_AUTHORIZATION_SORT_FIELDS, 'updatedAt'),
      ).toBe('expiresAt');
      expect(normalizeSectionSort('nextReviewDate', REGISTER_SORT_FIELDS, 'updatedAt')).toBe(
        'nextReviewDate',
      );
    });

    // A sort value carried over from another section (or injected via the
    // `dpSort` URL param) must not reach the API, which answers unknown sort
    // fields with HTTP 400 and blanks the whole section.
    it('falls back when the sort field belongs to a different endpoint', () => {
      expect(
        normalizeSectionSort('nextReviewDate', LEGACY_AUTHORIZATION_SORT_FIELDS, 'updatedAt'),
      ).toBe('updatedAt');
      expect(normalizeSectionSort('expiresAt', REGISTER_SORT_FIELDS, 'updatedAt')).toBe(
        'updatedAt',
      );
    });

    it('falls back for unknown values', () => {
      expect(normalizeSectionSort('', LEGACY_AUTHORIZATION_SORT_FIELDS, 'updatedAt')).toBe(
        'updatedAt',
      );
      expect(
        normalizeSectionSort('__injected__', LEGACY_AUTHORIZATION_SORT_FIELDS, 'updatedAt'),
      ).toBe('updatedAt');
    });
  });
});
