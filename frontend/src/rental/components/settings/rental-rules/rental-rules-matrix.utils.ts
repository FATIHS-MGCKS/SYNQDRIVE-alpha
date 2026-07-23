import type {
  OrganizationRentalRulesDto,
  RentalRulesOverviewDto,
  RentalVehicleCategoryDto,
  RentalVehicleCategoryStatus,
} from './rental-rules.types';
import { countConfiguredRuleFields } from './rental-rules.utils';

export type RentalRulesSectionId =
  | 'overview'
  | 'organization'
  | 'categories'
  | 'overrides'
  | 'history';

export type RentalRulesMatrixSortKey =
  | 'name'
  | 'vehicleCount'
  | 'minimumAgeYears'
  | 'depositAmountCents'
  | 'status';

export type RentalRulesMatrixSortDir = 'asc' | 'desc';

export type RentalRulesStatusFilter = 'ALL' | RentalVehicleCategoryStatus;

export interface RentalRulesMatrixFilters {
  search: string;
  status: RentalRulesStatusFilter;
  incompleteOnly: boolean;
}

export interface RentalRulesKpiSnapshot {
  orgDefaultsComplete: boolean;
  activeCategories: number;
  vehiclesWithoutCategory: number;
  vehiclesWithOverride: number;
  incompleteRules: number;
  unpublishedChanges: number;
}

export interface RentalRulesHeaderMeta {
  activeVersion: number;
  rulesActive: boolean;
  publishedAt: string | null;
  affectedVehicleCount: number;
  unpublishedDraftCount: number;
}

const CORE_RULE_FIELDS: Array<keyof RentalVehicleCategoryDto> = [
  'minimumAgeYears',
  'minimumLicenseHoldingMonths',
  'depositAmountCents',
];

export function isCategoryRulesIncomplete(category: RentalVehicleCategoryDto): boolean {
  if (category.status !== 'ACTIVE' && category.status !== 'DRAFT') return false;
  return CORE_RULE_FIELDS.some((field) => category[field] == null);
}

export function isOrganizationDefaultsComplete(
  defaults: OrganizationRentalRulesDto | null,
  overview: RentalRulesOverviewDto | null,
): boolean {
  if (!overview?.defaultsConfigured || !defaults) return false;
  return countConfiguredRuleFields(defaults) >= 3;
}

export function countUnpublishedDrafts(
  defaults: OrganizationRentalRulesDto | null,
  categories: RentalVehicleCategoryDto[],
): number {
  let count = defaults?.hasUnpublishedDraft ? 1 : 0;
  count += categories.filter((category) => category.hasUnpublishedDraft).length;
  return count;
}

export function buildRentalRulesKpis(
  overview: RentalRulesOverviewDto | null,
  defaults: OrganizationRentalRulesDto | null,
  categories: RentalVehicleCategoryDto[],
): RentalRulesKpiSnapshot {
  const incompleteRules = categories.filter(isCategoryRulesIncomplete).length;
  const orgIncomplete = overview?.defaultsConfigured ? 0 : 1;
  return {
    orgDefaultsComplete: isOrganizationDefaultsComplete(defaults, overview),
    activeCategories: overview?.activeCategoryCount ?? 0,
    vehiclesWithoutCategory: overview?.vehiclesMissingCategory ?? 0,
    vehiclesWithOverride: overview?.vehiclesWithOverrides ?? 0,
    incompleteRules: incompleteRules + orgIncomplete,
    unpublishedChanges: countUnpublishedDrafts(defaults, categories),
  };
}

export function buildRentalRulesHeaderMeta(
  overview: RentalRulesOverviewDto | null,
  defaults: OrganizationRentalRulesDto | null,
  categories: RentalVehicleCategoryDto[],
): RentalRulesHeaderMeta {
  return {
    activeVersion: defaults?.version ?? 1,
    rulesActive: overview?.defaultsActive ?? Boolean(defaults?.isActive),
    publishedAt: defaults?.updatedAt ?? null,
    affectedVehicleCount: overview?.totalVehicles ?? 0,
    unpublishedDraftCount: countUnpublishedDrafts(defaults, categories),
  };
}

export function filterMatrixCategories(
  categories: RentalVehicleCategoryDto[],
  filters: RentalRulesMatrixFilters,
): RentalVehicleCategoryDto[] {
  const query = filters.search.trim().toLowerCase();
  return categories.filter((category) => {
    if (filters.status !== 'ALL' && category.status !== filters.status) return false;
    if (filters.incompleteOnly && !isCategoryRulesIncomplete(category)) return false;
    if (!query) return true;
    const haystack = [
      category.name,
      category.type ?? '',
      category.description ?? '',
      category.status,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined): number {
  const left = a ?? -1;
  const right = b ?? -1;
  return left - right;
}

export function sortMatrixCategories(
  categories: RentalVehicleCategoryDto[],
  sortKey: RentalRulesMatrixSortKey,
  sortDir: RentalRulesMatrixSortDir,
): RentalVehicleCategoryDto[] {
  const sorted = [...categories].sort((left, right) => {
    let result = 0;
    switch (sortKey) {
      case 'name':
        result = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
        break;
      case 'vehicleCount':
        result = (left.vehicleCount ?? 0) - (right.vehicleCount ?? 0);
        break;
      case 'minimumAgeYears':
        result = compareNullableNumber(left.minimumAgeYears, right.minimumAgeYears);
        break;
      case 'depositAmountCents':
        result = compareNullableNumber(left.depositAmountCents, right.depositAmountCents);
        break;
      case 'status':
        result = left.status.localeCompare(right.status);
        break;
      default:
        result = 0;
    }
    return sortDir === 'asc' ? result : -result;
  });
  return sorted;
}

export function paginateMatrixCategories<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number; page: number; pageCount: number } {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageCount,
  };
}

export interface RentalRulesDraftScope {
  id: string;
  scope: 'defaults' | 'category';
  label: string;
  revisionId: string;
  expectedVersion: number;
  lockVersion: number;
}

export function collectPublishableDrafts(
  defaults: OrganizationRentalRulesDto | null,
  categories: RentalVehicleCategoryDto[],
): RentalRulesDraftScope[] {
  const drafts: RentalRulesDraftScope[] = [];
  if (defaults?.hasUnpublishedDraft && defaults.draftRevision) {
    drafts.push({
      id: 'defaults',
      scope: 'defaults',
      label: 'Organization defaults',
      revisionId: defaults.draftRevision.id,
      expectedVersion: defaults.version ?? 1,
      lockVersion: defaults.draftRevision.lockVersion,
    });
  }
  for (const category of categories) {
    if (!category.hasUnpublishedDraft || !category.draftRevision) continue;
    drafts.push({
      id: category.id,
      scope: 'category',
      label: category.name,
      revisionId: category.draftRevision.id,
      expectedVersion: category.version,
      lockVersion: category.draftRevision.lockVersion,
    });
  }
  return drafts;
}
