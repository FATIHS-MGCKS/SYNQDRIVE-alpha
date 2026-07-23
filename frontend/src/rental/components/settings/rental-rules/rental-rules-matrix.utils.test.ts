import { describe, expect, it } from 'vitest';
import type { OrganizationRentalRulesDto, RentalVehicleCategoryDto } from './rental-rules.types';
import {
  buildRentalRulesKpis,
  collectPublishableDrafts,
  filterMatrixCategories,
  isCategoryRulesIncomplete,
  paginateMatrixCategories,
  sortMatrixCategories,
} from './rental-rules-matrix.utils';

function category(
  partial: Partial<RentalVehicleCategoryDto> & Pick<RentalVehicleCategoryDto, 'id' | 'name'>,
): RentalVehicleCategoryDto {
  return {
    organizationId: 'org-1',
    description: null,
    type: 'COMPACT',
    color: null,
    icon: null,
    isActive: true,
    status: 'ACTIVE',
    statusChangedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    minimumAgeYears: 21,
    minimumLicenseHoldingMonths: 24,
    depositAmountCents: 50000,
    depositCurrency: 'EUR',
    creditCardRequired: true,
    foreignTravelPolicy: 'ALLOWED',
    additionalDriverPolicy: 'ALLOWED',
    youngDriverPolicy: 'ALLOWED',
    insuranceRequirement: null,
    manualApprovalRequired: false,
    notes: null,
    vehicleCount: 3,
    ...partial,
  };
}

describe('rental-rules-matrix.utils', () => {
  it('detects incomplete active categories missing core fields', () => {
    expect(isCategoryRulesIncomplete(category({ id: '1', name: 'A' }))).toBe(false);
    expect(
      isCategoryRulesIncomplete(
        category({ id: '2', name: 'B', minimumAgeYears: null, status: 'ACTIVE' }),
      ),
    ).toBe(true);
  });

  it('filters by search, status, and incomplete flag', () => {
    const rows = [
      category({ id: '1', name: 'Premium', status: 'ACTIVE' }),
      category({ id: '2', name: 'Van', status: 'DRAFT', minimumAgeYears: null }),
      category({ id: '3', name: 'Economy', status: 'ARCHIVED' }),
    ];
    const filtered = filterMatrixCategories(rows, {
      search: 'van',
      status: 'DRAFT',
      incompleteOnly: true,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('2');
  });

  it('sorts categories by vehicle count descending', () => {
    const rows = [
      category({ id: '1', name: 'A', vehicleCount: 1 }),
      category({ id: '2', name: 'B', vehicleCount: 5 }),
    ];
    const sorted = sortMatrixCategories(rows, 'vehicleCount', 'desc');
    expect(sorted.map((row) => row.id)).toEqual(['2', '1']);
  });

  it('paginates matrix rows', () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      category({ id: `c-${index}`, name: `Cat ${index}` }),
    );
    const page = paginateMatrixCategories(rows, 2, 10);
    expect(page.items).toHaveLength(10);
    expect(page.page).toBe(2);
    expect(page.pageCount).toBe(3);
  });

  it('builds KPI snapshot from overview data', () => {
    const kpis = buildRentalRulesKpis(
      {
        defaultsConfigured: false,
        defaultsActive: true,
        activeCategoryCount: 2,
        totalVehicles: 10,
        vehiclesWithCategory: 8,
        vehiclesMissingCategory: 2,
        vehiclesWithOverrides: 1,
        categoriesRequiringManualApproval: 0,
        overrideVehicles: [],
      },
      null,
      [category({ id: '1', name: 'Incomplete', minimumAgeYears: null })],
    );
    expect(kpis.orgDefaultsComplete).toBe(false);
    expect(kpis.activeCategories).toBe(2);
    expect(kpis.incompleteRules).toBe(2);
  });

  it('collects publishable org and category drafts', () => {
    const defaults = {
      organizationId: 'org-1',
      isActive: true,
      configured: true,
      version: 2,
      hasUnpublishedDraft: true,
      draftRevision: { id: 'rev-org', lockVersion: 1, rulesHash: 'h', version: 3 },
    } as OrganizationRentalRulesDto;
    const drafts = collectPublishableDrafts(defaults, [
      category({
        id: 'cat-1',
        name: 'SUV',
        hasUnpublishedDraft: true,
        draftRevision: { id: 'rev-cat', lockVersion: 2, rulesHash: 'x', version: 4 },
      }),
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.scope).toBe('defaults');
    expect(drafts[1]?.scope).toBe('category');
  });
});
