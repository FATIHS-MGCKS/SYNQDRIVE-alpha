/**
 * Low-cardinality DIMO provider request categories for budgeting, metrics, and fairness.
 * Do not add vehicleId/orgId/tripId labels.
 */
export const DIMO_PROVIDER_CATEGORIES = [
  'LIVE_SNAPSHOT',
  'ACTIVE_TRIP',
  'RECONCILIATION',
  'POST_TRIP_ENRICHMENT',
  'HEALTH',
  'IDENTITY',
  'ENERGY',
  'ADMIN',
] as const;

export type DimoProviderCategory = (typeof DIMO_PROVIDER_CATEGORIES)[number];

/** Lower numeric value = higher priority. */
export const DIMO_PROVIDER_PRIORITIES = [
  'CRITICAL',
  'HIGH',
  'NORMAL',
  'LOW',
  'BACKGROUND',
] as const;

export type DimoProviderPriority = (typeof DIMO_PROVIDER_PRIORITIES)[number];

export const DIMO_PRIORITY_NUMERIC: Record<DimoProviderPriority, number> = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
  BACKGROUND: 5,
};

export const DEFAULT_CATEGORY_PRIORITY: Record<DimoProviderCategory, DimoProviderPriority> = {
  LIVE_SNAPSHOT: 'HIGH',
  ACTIVE_TRIP: 'CRITICAL',
  RECONCILIATION: 'NORMAL',
  POST_TRIP_ENRICHMENT: 'NORMAL',
  HEALTH: 'LOW',
  IDENTITY: 'BACKGROUND',
  ENERGY: 'NORMAL',
  ADMIN: 'BACKGROUND',
};

export interface DimoRequestContext {
  category: DimoProviderCategory;
  priority?: DimoProviderPriority;
  /** Skip global budget (tests / emergency only — logs warning). */
  bypassBudget?: boolean;
}

export const DEFAULT_DIMO_REQUEST_CONTEXT: DimoRequestContext = {
  category: 'LIVE_SNAPSHOT',
  priority: 'NORMAL',
};
