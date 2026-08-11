/**
 * Canonical SynqDrive Evaluations tenant-safe analytics foundation contracts (E2).
 *
 * These contracts are transport/shape authority for the analytics foundation:
 * typed entity references, analytics scope, allowlisted filters, bounded
 * pagination, and the summary-vs-detail response separation.
 *
 * Security invariants encoded here:
 * - A client-supplied `organizationId` in {@link EvaluationsAnalyticsScope} is a
 *   REQUEST, never an authorization. The server intersects it with the actor's
 *   authorized scope (see backend scope resolver) before any data access.
 * - Entity references carry identifiers and relation semantics only; they never
 *   embed PII of the referenced entity (labels are resolved, authorized, at read
 *   time from the owning domain).
 * - Summary aggregate totals are always distinct from returned/top-N items so a
 *   top-N list can never be mistaken for a full population count.
 *
 * E1 metric/period/money taxonomies remain the single authority; this module
 * reuses {@link EvaluationsPeriodWindow} and E1 status semantics rather than
 * defining a second taxonomy.
 */
import type { EvaluationsPeriodWindow } from '../evaluations-periods/evaluations-period.contract';
import type { EvaluationsMetricStatus } from '../evaluations-metrics/evaluations-metric-response.contract';

export const EVALUATIONS_ANALYTICS_CONTRACT_SCHEMA_VERSION = '1.0.0' as const;

/* ─── Entity references (EVAL-ADR-004) ───────────────────────────────────── */

/** Canonical analytics entity domains E2 may reference. Registry-controlled. */
export const EVALUATIONS_ENTITY_TYPES = [
  'VEHICLE',
  'BOOKING',
  'CUSTOMER',
  'DRIVER',
  'USER',
  'INVOICE',
  'PAYMENT',
  'TASK',
  'SERVICE_CASE',
  'DAMAGE',
  'DOCUMENT',
  'STATION',
] as const;
export type EvaluationsEntityType = (typeof EVALUATIONS_ENTITY_TYPES)[number];

/** Typed relation semantics between an analytical object and a referenced entity. */
export const EVALUATIONS_RELATION_TYPES = [
  'PRIMARY_SUBJECT',
  'CONTRIBUTOR',
  'RELATED',
  'SOURCE',
  'IMPACTED',
] as const;
export type EvaluationsRelationType = (typeof EVALUATIONS_RELATION_TYPES)[number];

/** The kind of analytical object that owns a reference. */
export const EVALUATIONS_REFERENCE_OWNER_TYPES = ['INSIGHT', 'ANALYTICS_GROUP'] as const;
export type EvaluationsReferenceOwnerType =
  (typeof EVALUATIONS_REFERENCE_OWNER_TYPES)[number];

/**
 * A typed, tenant-owned reference from an analytical object to a domain entity.
 * Identity is `(organizationId, ownerType, ownerId, entityType, entityId,
 * relationType)`; display labels are NOT part of identity and are never stored
 * here.
 */
export interface EvaluationsEntityReference {
  readonly organizationId: string;
  readonly stationId: string | null;
  readonly ownerType: EvaluationsReferenceOwnerType;
  readonly ownerId: string;
  readonly entityType: EvaluationsEntityType;
  readonly entityId: string;
  readonly relationType: EvaluationsRelationType;
}

/**
 * PII-bearing property names that must never appear on an entity reference
 * object. Enforced at runtime by the validator to guarantee data minimization.
 */
export const EVALUATIONS_ENTITY_REFERENCE_FORBIDDEN_PII_KEYS = [
  'name',
  'customerName',
  'driverName',
  'firstName',
  'lastName',
  'fullName',
  'displayName',
  'email',
  'phone',
  'phoneNumber',
  'address',
  'licenseNumber',
  'documentNumber',
  'vin',
  'iban',
] as const;

/**
 * Deterministic dedupe key for an entity reference. Tenant scope is part of the
 * key so the same natural entity id may exist across organizations.
 */
export function buildEvaluationsEntityReferenceDedupeKey(
  reference: Pick<
    EvaluationsEntityReference,
    'organizationId' | 'ownerType' | 'ownerId' | 'entityType' | 'entityId' | 'relationType'
  >,
): string {
  return [
    reference.organizationId,
    reference.ownerType,
    reference.ownerId,
    reference.entityType,
    reference.entityId,
    reference.relationType,
  ].join('|');
}

/* ─── Analytics scope ────────────────────────────────────────────────────── */

export const EVALUATIONS_ANALYTICS_MAX_STATION_IDS = 100;

/**
 * A requested analytics scope. `organizationId` and `stationIds` here are
 * REQUESTED values, not authorization. The server resolves them against the
 * actor's authorized tenant/station scope before any query.
 */
export interface EvaluationsAnalyticsScope {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly period: EvaluationsPeriodWindow;
}

/**
 * The server-resolved, authorized scope. `stationIds === null` means all
 * stations the actor may read within the organization.
 */
export interface EvaluationsAuthorizedAnalyticsScope {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly stationScoped: boolean;
  readonly period: EvaluationsPeriodWindow;
}

/* ─── Filters (allowlisted, bounded, normalized) ─────────────────────────── */

/**
 * Business filter dimensions. Station scope is intentionally NOT a filter: it is
 * an authorization concern owned solely by {@link EvaluationsAnalyticsScope}
 * (`stationIds`) and resolved server-side. A filter can therefore never widen or
 * re-define the authorized station scope.
 */
export const EVALUATIONS_ANALYTICS_FILTER_KEYS = [
  'vehicleIds',
  'customerIds',
  'entityTypes',
  'relationTypes',
] as const;
export type EvaluationsAnalyticsFilterKey =
  (typeof EVALUATIONS_ANALYTICS_FILTER_KEYS)[number];

export const EVALUATIONS_ANALYTICS_MAX_FILTER_IDS = 200;

/** Maximum accepted length of any single identifier value (anti-DoS). */
export const EVALUATIONS_ANALYTICS_MAX_ID_LENGTH = 128;

export interface EvaluationsAnalyticsFilters {
  readonly vehicleIds?: readonly string[];
  readonly customerIds?: readonly string[];
  readonly entityTypes?: readonly EvaluationsEntityType[];
  readonly relationTypes?: readonly EvaluationsRelationType[];
}

/* ─── Pagination + sorting (bounded, allowlisted) ────────────────────────── */

export const EVALUATIONS_ANALYTICS_DEFAULT_PAGE_SIZE = 20;
export const EVALUATIONS_ANALYTICS_MAX_PAGE_SIZE = 100;
/** Upper bound on the page number so a computed offset can never overflow. */
export const EVALUATIONS_ANALYTICS_MAX_PAGE = 100_000;

export const EVALUATIONS_ANALYTICS_DEFAULT_GROUP_LIMIT = 20;
export const EVALUATIONS_ANALYTICS_MAX_GROUP_LIMIT = 100;

export const EVALUATIONS_ANALYTICS_DETAIL_SORT_FIELDS = [
  'createdAt',
  'entityType',
  'relationType',
] as const;
export type EvaluationsAnalyticsDetailSortField =
  (typeof EVALUATIONS_ANALYTICS_DETAIL_SORT_FIELDS)[number];

export const EVALUATIONS_ANALYTICS_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type EvaluationsAnalyticsSortDirection =
  (typeof EVALUATIONS_ANALYTICS_SORT_DIRECTIONS)[number];

export interface EvaluationsAnalyticsPageRequest {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: EvaluationsAnalyticsDetailSortField;
  readonly sortDir?: EvaluationsAnalyticsSortDirection;
}

export interface EvaluationsAnalyticsNormalizedPage {
  readonly page: number;
  readonly pageSize: number;
  readonly skip: number;
  readonly take: number;
  readonly sortBy: EvaluationsAnalyticsDetailSortField;
  readonly sortDir: EvaluationsAnalyticsSortDirection;
}

/* ─── Grouping ───────────────────────────────────────────────────────────── */

export const EVALUATIONS_ANALYTICS_GROUP_DIMENSIONS = [
  'ENTITY_TYPE',
  'RELATION_TYPE',
  'STATION',
] as const;
export type EvaluationsAnalyticsGroupDimension =
  (typeof EVALUATIONS_ANALYTICS_GROUP_DIMENSIONS)[number];

export interface EvaluationsAnalyticsGroupKey {
  readonly entityType?: EvaluationsEntityType;
  readonly relationType?: EvaluationsRelationType;
  readonly stationId?: string | null;
}

export interface EvaluationsAnalyticsGroup {
  readonly groupBy: EvaluationsAnalyticsGroupDimension;
  readonly key: EvaluationsAnalyticsGroupKey;
  readonly count: number;
}

/* ─── Summary vs detail responses ────────────────────────────────────────── */

/**
 * Analytics responses reuse the canonical E1 metric status authority directly
 * (single source of truth) rather than defining a second taxonomy. This alias
 * exists only for readable naming at analytics call sites; it resolves to the
 * exact E1 union and therefore includes `STALE`.
 *
 * @see EvaluationsMetricStatus (shared/evaluations-metrics)
 */
export type EvaluationsAnalyticsStatus = EvaluationsMetricStatus;

export interface EvaluationsAnalyticsScopeEcho {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly stationScoped: boolean;
}

export interface EvaluationsAnalyticsSummaryResponse {
  readonly schemaVersion: typeof EVALUATIONS_ANALYTICS_CONTRACT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: EvaluationsAnalyticsStatus;
  readonly scope: EvaluationsAnalyticsScopeEcho;
  readonly period: EvaluationsPeriodWindow;
  readonly appliedFilters: Readonly<Record<string, unknown>>;
  /** Total references in scope. `null` only for UNAVAILABLE/ERROR/NOT_APPLICABLE. */
  readonly aggregateTotal: number | null;
  readonly groupBy: EvaluationsAnalyticsGroupDimension | null;
  /** Bounded, possibly top-N groups. Never a substitute for {@link aggregateTotal}. */
  readonly groups: readonly EvaluationsAnalyticsGroup[];
  /** The cap applied to {@link groups}; a top-N list is explicit, not the total. */
  readonly groupLimit: number;
}

export interface EvaluationsAnalyticsDetailItem {
  readonly reference: EvaluationsEntityReference;
  readonly createdAt: string;
}

export interface EvaluationsAnalyticsDetailResponse {
  readonly schemaVersion: typeof EVALUATIONS_ANALYTICS_CONTRACT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly status: EvaluationsAnalyticsStatus;
  readonly scope: EvaluationsAnalyticsScopeEcho;
  readonly period: EvaluationsPeriodWindow;
  readonly appliedFilters: Readonly<Record<string, unknown>>;
  /** Total matching references under the same scope+filter as the summary. */
  readonly totalCount: number;
  /** Items on this page only. Never equal to {@link totalCount} by construction. */
  readonly returnedCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
  readonly items: readonly EvaluationsAnalyticsDetailItem[];
}
