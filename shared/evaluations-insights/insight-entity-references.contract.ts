/**
 * Typed entity references for Business Insights grouping and analytics (Prompt 16/54).
 */

export type InsightEntityType = 'VEHICLE' | 'BOOKING' | 'CUSTOMER' | 'STATION' | 'ORGANIZATION';

export type InsightEntityRelationType = 'PRIMARY' | 'AFFECTED' | 'CONTEXT' | 'GROUP_MEMBER';

export interface InsightEntityReference {
  entityType: InsightEntityType;
  entityId: string;
  organizationId: string;
  stationId?: string | null;
  relationType: InsightEntityRelationType;
}

/** Per-insight entity breakdown persisted on dashboard_insights / returned in detail API. */
export interface InsightEntityBreakdown {
  /** Number of merged source events when isGrouped (≥1). */
  eventCount: number;
  /** Distinct entities in the primary scope (matches persisted groupCount). */
  groupCount: number;
  references: InsightEntityReference[];
}

export interface InsightEntityCountSummary {
  /** Visible insight rows (groups), not individual events. */
  insightGroups: number;
  /** Sum of eventCount across visible insights. */
  events: number;
  affectedVehicles: number;
  affectedBookings: number;
  affectedCustomers: number;
  affectedStations: number;
  uniqueEntities: number;
  /** CRITICAL insights with at least one BOOKING primary/affected reference. */
  criticalBookings: number;
  /** Business-risk groups without booking reference (org/station/fleet level). */
  orgWideRisks: number;
  /** Business-risk groups with booking reference. */
  bookingScopedRisks: number;
}

export interface InsightEntityAwareRow {
  id: string;
  type: string;
  severity: string;
  entityScope?: string | null;
  entityIds?: string[] | null;
  isGrouped?: boolean;
  groupCount?: number;
  organizationId?: string;
  entityReferences?: InsightEntityReference[] | null;
  metrics?: Record<string, unknown> | null;
  timeContext?: Record<string, string> | null;
}
