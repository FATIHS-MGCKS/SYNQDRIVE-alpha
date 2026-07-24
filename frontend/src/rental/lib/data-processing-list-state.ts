export type DataProcessingKpiKey =
  | 'active_activities'
  | 'blocking_gaps'
  | 'reviews_due'
  | 'revocations_in_progress'
  | 'enforcement_errors'
  | 'dpia_overdue'
  | 'legacy_active'
  | 'legacy_pending'
  | 'legacy_expiring_soon'
  | 'legacy_revoked_expired'
  | 'legacy_high_risk';

export type DataProcessingSectionFilterState = {
  q: string;
  status: string;
  kpi: DataProcessingKpiKey | null;
  riskLevel: string;
  dataCategory: string;
  sort: string;
  dir: 'asc' | 'desc';
  cursor: string | null;
  limit: number;
};

export const DEFAULT_SECTION_FILTERS: DataProcessingSectionFilterState = {
  q: '',
  status: '',
  kpi: null,
  riskLevel: '',
  dataCategory: '',
  sort: 'updatedAt',
  dir: 'desc',
  cursor: null,
  limit: 25,
};

const URL_PREFIX = 'dp';

export function readDataProcessingFiltersFromUrl(): Partial<DataProcessingSectionFilterState> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const next: Partial<DataProcessingSectionFilterState> = {};

  const q = params.get(`${URL_PREFIX}Q`);
  if (q) next.q = q;

  const status = params.get(`${URL_PREFIX}Status`);
  if (status) next.status = status;

  const kpi = params.get(`${URL_PREFIX}Kpi`) as DataProcessingKpiKey | null;
  if (kpi) next.kpi = kpi;

  const risk = params.get(`${URL_PREFIX}Risk`);
  if (risk) next.riskLevel = risk;

  const category = params.get(`${URL_PREFIX}Category`);
  if (category) next.dataCategory = category;

  const sort = params.get(`${URL_PREFIX}Sort`);
  if (sort) next.sort = sort;

  const dir = params.get(`${URL_PREFIX}Dir`);
  if (dir === 'asc' || dir === 'desc') next.dir = dir;

  const limit = params.get(`${URL_PREFIX}Limit`);
  if (limit && Number.isFinite(Number(limit))) next.limit = Number(limit);

  return next;
}

export function syncDataProcessingFiltersToUrl(filters: DataProcessingSectionFilterState): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);

  const setOrDelete = (key: string, value: string | null | undefined) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };

  setOrDelete(`${URL_PREFIX}Q`, filters.q || null);
  setOrDelete(`${URL_PREFIX}Status`, filters.status || null);
  setOrDelete(`${URL_PREFIX}Kpi`, filters.kpi || null);
  setOrDelete(`${URL_PREFIX}Risk`, filters.riskLevel || null);
  setOrDelete(`${URL_PREFIX}Category`, filters.dataCategory || null);
  setOrDelete(`${URL_PREFIX}Sort`, filters.sort !== 'updatedAt' ? filters.sort : null);
  setOrDelete(`${URL_PREFIX}Dir`, filters.dir !== 'desc' ? filters.dir : null);
  setOrDelete(`${URL_PREFIX}Limit`, filters.limit !== 25 ? String(filters.limit) : null);

  const qs = params.toString();
  const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', next);
}

export function kpiToRegisterParams(kpi: DataProcessingKpiKey | null): Record<string, string | boolean> {
  switch (kpi) {
    case 'active_activities':
      return { kpiFilter: 'active' };
    case 'blocking_gaps':
      return { kpiFilter: 'blocking_gaps' };
    case 'reviews_due':
      return { kpiFilter: 'review_due' };
    case 'revocations_in_progress':
      return { kpiFilter: 'revocations_in_progress' };
    case 'dpia_overdue':
      return { kpiFilter: 'dpia_overdue' };
    default:
      return {};
  }
}

export function kpiToLegacyParams(kpi: DataProcessingKpiKey | null): Record<string, string | boolean> {
  switch (kpi) {
    case 'legacy_active':
      return { status: 'ACTIVE' };
    case 'legacy_pending':
      return { status: 'PENDING' };
    case 'legacy_expiring_soon':
      return { expiringSoon: true };
    case 'legacy_revoked_expired':
      return { revokedOrExpired: true };
    case 'legacy_high_risk':
      return { riskLevel: 'HIGH' };
    case 'revocations_in_progress':
      return { revocationInProgress: true };
    default:
      return {};
  }
}

export function hasActiveFilters(filters: DataProcessingSectionFilterState): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.kpi ||
      filters.riskLevel ||
      filters.dataCategory,
  );
}
