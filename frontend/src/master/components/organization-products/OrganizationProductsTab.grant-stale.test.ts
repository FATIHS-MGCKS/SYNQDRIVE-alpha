import { describe, expect, it } from 'vitest';
import { shouldApplyGrantLoadResult } from './product-management-sync-errors';

describe('OrganizationProductsTab grant stale guard', () => {
  it('simulates rental/vymod reverse resolution: only active slug wins', () => {
    const rentalId = 1;
    const vymodId = 2;
    let activeSlug: string | null = 'VYMOD';
    let activeRequestId = 2;

    expect(shouldApplyGrantLoadResult(rentalId, activeRequestId, 'RENTAL', activeSlug)).toBe(false);
    expect(shouldApplyGrantLoadResult(vymodId, activeRequestId, 'VYMOD', activeSlug)).toBe(true);

    activeSlug = 'RENTAL';
    activeRequestId = 3;
    expect(shouldApplyGrantLoadResult(rentalId, activeRequestId, 'RENTAL', activeSlug)).toBe(false);
    expect(shouldApplyGrantLoadResult(vymodId, activeRequestId, 'VYMOD', activeSlug)).toBe(false);
    expect(shouldApplyGrantLoadResult(3, activeRequestId, 'RENTAL', activeSlug)).toBe(true);
  });

  it('failed load clears context until retry succeeds (guard blocks stale success)', () => {
    const requestId = 4;
    const slug = 'VYMOD';
    expect(shouldApplyGrantLoadResult(requestId, 5, slug, slug)).toBe(false);
  });
});