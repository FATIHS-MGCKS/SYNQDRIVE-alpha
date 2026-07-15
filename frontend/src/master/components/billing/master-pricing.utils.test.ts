import { describe, expect, it } from 'vitest';
import {
  centsToEuroInput,
  eurosToCents,
  isPublishedVersionEditable,
  priceVersionDisplayStatusLabel,
  resolvePriceVersionDisplayStatus,
  validateTierRows,
} from './master-pricing.utils';

describe('master pricing utils', () => {
  it('rounds euro input to minor units', () => {
    expect(eurosToCents('12,34')).toBe(1234);
    expect(eurosToCents('12.345')).toBe(1235);
    expect(centsToEuroInput(1234)).toBe('12,34');
  });

  it('labels version display status including scheduled', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(resolvePriceVersionDisplayStatus({ status: 'DRAFT', effectiveFrom: null })).toBe('DRAFT');
    expect(
      resolvePriceVersionDisplayStatus({ status: 'ACTIVE', effectiveFrom: future }),
    ).toBe('SCHEDULED');
    expect(
      resolvePriceVersionDisplayStatus({ status: 'ACTIVE', effectiveFrom: '2020-01-01T00:00:00.000Z' }),
    ).toBe('PUBLISHED');
    expect(priceVersionDisplayStatusLabel('SCHEDULED')).toBe('Geplant');
  });

  it('blocks editing published versions', () => {
    expect(isPublishedVersionEditable({ status: 'DRAFT' })).toBe(true);
    expect(isPublishedVersionEditable({ status: 'ACTIVE' })).toBe(false);
    expect(isPublishedVersionEditable({ status: 'ARCHIVED' })).toBe(false);
  });

  it('detects tier gaps and overlaps', () => {
    const issues = validateTierRows([
      { id: '1', minVehicles: 1, maxVehicles: 5, unitPriceCents: 1000, sortOrder: 0 },
      { id: '2', minVehicles: 8, maxVehicles: null, unitPriceCents: 800, sortOrder: 1 },
    ]);
    expect(issues.some((issue) => issue.kind === 'gap')).toBe(true);

    const overlapIssues = validateTierRows([
      { id: '1', minVehicles: 1, maxVehicles: 10, unitPriceCents: 1000, sortOrder: 0 },
      { id: '2', minVehicles: 8, maxVehicles: null, unitPriceCents: 800, sortOrder: 1 },
    ]);
    expect(overlapIssues.some((issue) => issue.kind === 'overlap')).toBe(true);
  });
});
