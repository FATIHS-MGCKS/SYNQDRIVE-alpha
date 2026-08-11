/**
 * Runtime validators and normalizers for the tenant-safe analytics foundation.
 *
 * These functions enforce the shape/allowlist/bound invariants of the E2
 * contracts. They are deliberately free of any authorization logic: tenant and
 * station authorization is a server-only concern (scope resolver + repository
 * scoping). Validation here prevents malformed, unbounded, PII-bearing, or
 * injection-shaped input from ever reaching a query builder.
 */
import {
  EVALUATIONS_ANALYTICS_DEFAULT_PAGE_SIZE,
  EVALUATIONS_ANALYTICS_DETAIL_SORT_FIELDS,
  EVALUATIONS_ANALYTICS_FILTER_KEYS,
  EVALUATIONS_ANALYTICS_GROUP_DIMENSIONS,
  EVALUATIONS_ANALYTICS_MAX_FILTER_IDS,
  EVALUATIONS_ANALYTICS_MAX_PAGE_SIZE,
  EVALUATIONS_ANALYTICS_MAX_STATION_IDS,
  EVALUATIONS_ANALYTICS_SORT_DIRECTIONS,
  EVALUATIONS_ENTITY_REFERENCE_FORBIDDEN_PII_KEYS,
  EVALUATIONS_ENTITY_TYPES,
  EVALUATIONS_REFERENCE_OWNER_TYPES,
  EVALUATIONS_RELATION_TYPES,
  type EvaluationsAnalyticsDetailSortField,
  type EvaluationsAnalyticsFilters,
  type EvaluationsAnalyticsGroupDimension,
  type EvaluationsAnalyticsNormalizedPage,
  type EvaluationsAnalyticsPageRequest,
  type EvaluationsAnalyticsSortDirection,
  type EvaluationsEntityReference,
  type EvaluationsEntityType,
  type EvaluationsRelationType,
} from './evaluations-analytics.contract';

export class EvaluationsAnalyticsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationsAnalyticsValidationError';
  }
}

function fail(message: string): never {
  throw new EvaluationsAnalyticsValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/* ─── Entity reference validation ────────────────────────────────────────── */

export function assertValidEvaluationsEntityReference(
  reference: EvaluationsEntityReference,
): void {
  if (!isRecord(reference)) fail('Entity reference must be an object');

  for (const key of EVALUATIONS_ENTITY_REFERENCE_FORBIDDEN_PII_KEYS) {
    if (key in (reference as Record<string, unknown>)) {
      fail(`Entity reference must not carry PII field "${key}"`);
    }
  }

  if (!isNonEmptyString(reference.organizationId)) {
    fail('Entity reference organizationId is required');
  }
  if (reference.stationId !== null && !isNonEmptyString(reference.stationId)) {
    fail('Entity reference stationId must be null or a non-empty string');
  }
  if (!EVALUATIONS_REFERENCE_OWNER_TYPES.includes(reference.ownerType)) {
    fail(`Invalid entity reference ownerType: ${String(reference.ownerType)}`);
  }
  if (!isNonEmptyString(reference.ownerId)) {
    fail('Entity reference ownerId is required');
  }
  if (!EVALUATIONS_ENTITY_TYPES.includes(reference.entityType)) {
    fail(`Invalid entity reference entityType: ${String(reference.entityType)}`);
  }
  if (!isNonEmptyString(reference.entityId)) {
    fail('Entity reference entityId is required');
  }
  if (!EVALUATIONS_RELATION_TYPES.includes(reference.relationType)) {
    fail(`Invalid entity reference relationType: ${String(reference.relationType)}`);
  }
}

/* ─── Filter normalization ───────────────────────────────────────────────── */

function normalizeIdList(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(`Filter "${label}" must be an array`);
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!isNonEmptyString(raw)) fail(`Filter "${label}" contains an empty value`);
    const trimmed = raw.trim();
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  if (cleaned.length > EVALUATIONS_ANALYTICS_MAX_FILTER_IDS) {
    fail(
      `Filter "${label}" exceeds the maximum of ${EVALUATIONS_ANALYTICS_MAX_FILTER_IDS} values`,
    );
  }
  return cleaned;
}

function normalizeEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(`Filter "${label}" must be an array`);
  const cleaned: T[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
      fail(`Filter "${label}" contains an unsupported value: ${String(raw)}`);
    }
    if (seen.has(raw)) continue;
    seen.add(raw);
    cleaned.push(raw as T);
  }
  return cleaned;
}

/**
 * Validate and normalize raw client filter input into the typed allowlist form.
 * Rejects unknown keys (no arbitrary field/operator/value query language),
 * de-duplicates, bounds list sizes, and validates enum membership.
 */
export function normalizeEvaluationsAnalyticsFilters(
  raw: unknown,
): EvaluationsAnalyticsFilters {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) fail('Filters must be an object');

  for (const key of Object.keys(raw)) {
    if (!(EVALUATIONS_ANALYTICS_FILTER_KEYS as readonly string[]).includes(key)) {
      fail(`Unsupported filter key: ${key}`);
    }
  }

  const filters: {
    stationIds?: string[];
    vehicleIds?: string[];
    customerIds?: string[];
    entityTypes?: EvaluationsEntityType[];
    relationTypes?: EvaluationsRelationType[];
  } = {};

  const stationIds = normalizeIdList(raw.stationIds, 'stationIds');
  if (stationIds !== undefined) {
    if (stationIds.length > EVALUATIONS_ANALYTICS_MAX_STATION_IDS) {
      fail(
        `Filter "stationIds" exceeds the maximum of ${EVALUATIONS_ANALYTICS_MAX_STATION_IDS} values`,
      );
    }
    filters.stationIds = stationIds;
  }

  const vehicleIds = normalizeIdList(raw.vehicleIds, 'vehicleIds');
  if (vehicleIds !== undefined) filters.vehicleIds = vehicleIds;

  const customerIds = normalizeIdList(raw.customerIds, 'customerIds');
  if (customerIds !== undefined) filters.customerIds = customerIds;

  const entityTypes = normalizeEnumList(
    raw.entityTypes,
    EVALUATIONS_ENTITY_TYPES,
    'entityTypes',
  );
  if (entityTypes !== undefined) filters.entityTypes = entityTypes;

  const relationTypes = normalizeEnumList(
    raw.relationTypes,
    EVALUATIONS_RELATION_TYPES,
    'relationTypes',
  );
  if (relationTypes !== undefined) filters.relationTypes = relationTypes;

  return filters;
}

/* ─── Station list normalization (scope input) ───────────────────────────── */

export function normalizeEvaluationsRequestedStationIds(
  value: unknown,
): string[] | null {
  if (value === undefined || value === null) return null;
  const normalized = normalizeIdList(value, 'stationIds') ?? [];
  if (normalized.length > EVALUATIONS_ANALYTICS_MAX_STATION_IDS) {
    fail(
      `Requested stationIds exceed the maximum of ${EVALUATIONS_ANALYTICS_MAX_STATION_IDS} values`,
    );
  }
  return normalized;
}

/* ─── Pagination + sorting normalization ─────────────────────────────────── */

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    fail('Pagination values must be positive integers');
  }
  return parsed;
}

export function normalizeEvaluationsAnalyticsPage(
  request: EvaluationsAnalyticsPageRequest | undefined,
): EvaluationsAnalyticsNormalizedPage {
  const page = normalizePositiveInt(request?.page, 1);
  const requestedSize = normalizePositiveInt(
    request?.pageSize,
    EVALUATIONS_ANALYTICS_DEFAULT_PAGE_SIZE,
  );
  const pageSize = Math.min(requestedSize, EVALUATIONS_ANALYTICS_MAX_PAGE_SIZE);

  let sortBy: EvaluationsAnalyticsDetailSortField = 'createdAt';
  if (request?.sortBy !== undefined) {
    if (!EVALUATIONS_ANALYTICS_DETAIL_SORT_FIELDS.includes(request.sortBy)) {
      fail(`Unsupported sort field: ${String(request.sortBy)}`);
    }
    sortBy = request.sortBy;
  }

  let sortDir: EvaluationsAnalyticsSortDirection = 'desc';
  if (request?.sortDir !== undefined) {
    if (!EVALUATIONS_ANALYTICS_SORT_DIRECTIONS.includes(request.sortDir)) {
      fail(`Unsupported sort direction: ${String(request.sortDir)}`);
    }
    sortDir = request.sortDir;
  }

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    sortBy,
    sortDir,
  };
}

/* ─── Group dimension validation ─────────────────────────────────────────── */

export function assertValidEvaluationsAnalyticsGroupDimension(
  value: unknown,
): asserts value is EvaluationsAnalyticsGroupDimension {
  if (
    typeof value !== 'string' ||
    !(EVALUATIONS_ANALYTICS_GROUP_DIMENSIONS as readonly string[]).includes(value)
  ) {
    fail(`Unsupported group dimension: ${String(value)}`);
  }
}
