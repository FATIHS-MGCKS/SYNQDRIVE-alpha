import { InsightType, InsightSeverity, InsightEntityScope } from '@prisma/client';

export { InsightType, InsightSeverity, InsightEntityScope };

// ─── Candidate & Detector ────────────────────────────────────────────

export interface InsightCandidate {
  type: InsightType;
  severity: InsightSeverity;
  priority: number;
  title: string;
  message: string;
  actionLabel?: string;
  actionType?: string;
  entityScope: InsightEntityScope;
  entityIds: string[];
  timeContext?: Record<string, string>;
  // Persisted as Prisma JSON; allow nested structures (e.g. per-entity
  // breakdown for grouped insights consumed by the dashboard).
  metrics?: Record<string, any>;
  reasons: string[];
  confidence: number;
  dedupeKey: string;
  groupKey?: string;
  expiresAt?: Date;
}

export interface DetectorContext {
  organizationId: string;
  now: Date;
  policy: TenantPolicy;
}

export interface InsightDetector {
  readonly type: InsightType;
  detect(ctx: DetectorContext): Promise<InsightCandidate[]>;
}

// ─── Tenant Policy ───────────────────────────────────────────────────

export interface TenantPolicy {
  enabled: boolean;
  refreshIntervalMin: number;
  maxVisibleInsights: number;
  enabledTypes: InsightType[];
  handoverBufferMin: number;
  lowUtilizationDays: number;
  stationShortageThreshold: number;
  serviceWindowMinHours: number;
  serviceBeforeBookingHours: number;
  useLlmFormatting: boolean;
}

export const DEFAULT_POLICY: TenantPolicy = {
  enabled: true,
  refreshIntervalMin: 30,
  maxVisibleInsights: 4,
  enabledTypes: [
    InsightType.TIGHT_HANDOVER,
    InsightType.RETURN_NEEDS_INSPECTION,
    InsightType.STATION_SHORTAGE,
    InsightType.LOW_UTILIZATION,
    InsightType.SERVICE_WINDOW,
    InsightType.SERVICE_BEFORE_BOOKING,
    InsightType.BATTERY_CRITICAL,
    InsightType.SERVICE_OVERDUE,
    InsightType.PICKUP_OVERDUE,
  ],
  handoverBufferMin: 60,
  lowUtilizationDays: 7,
  stationShortageThreshold: 1,
  serviceWindowMinHours: 4,
  serviceBeforeBookingHours: 48,
  useLlmFormatting: false,
};

// ─── Dashboard Response DTOs ─────────────────────────────────────────

export interface DashboardInsightsResponse {
  generatedAt: string;
  summary: { total: number; critical: number; warning: number; opportunity: number; info: number };
  insights: DashboardInsightDto[];
}

export interface DashboardInsightDto {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  priority: number;
  title: string;
  message: string;
  actionLabel?: string | null;
  actionType?: string | null;
  entityScope: InsightEntityScope;
  entityIds: string[] | null;
  timeContext?: Record<string, string> | null;
  metrics?: Record<string, any> | null;
  reasons?: string[] | null;
  isGrouped: boolean;
  groupCount: number;
  createdAt: string;
}

// ─── Run History / Diagnostics DTOs ──────────────────────────────────

export interface InsightRunSummaryDto {
  id: string;
  organizationId: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  candidateCount: number;
  publishedCount: number;
  errorMessage: string | null;
}

export interface InsightRunDetailDto extends InsightRunSummaryDto {
  insights: DashboardInsightDto[];
}

// ─── Policy Update DTO ──────────────────────────────────────────────

export interface PolicyUpdatePayload {
  enabled?: boolean;
  refreshIntervalMin?: number;
  maxVisibleInsights?: number;
  enabledTypes?: InsightType[];
  useLlmFormatting?: boolean;
  policyOverrides?: Record<string, any>;
}

// ─── Trigger types ──────────────────────────────────────────────────

export type InsightTriggerSource =
  | 'scheduled_30min'
  | 'scheduled_active'
  | 'manual_admin'
  | 'manual_admin_single'
  | 'manual_force'
  | 'debounced_event'
  | 'event_booking_change'
  | 'event_vehicle_change'
  | 'event_station_change';
