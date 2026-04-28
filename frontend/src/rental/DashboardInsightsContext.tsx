import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useRentalOrg } from './RentalContext';
import type { VehicleData } from './data/vehicles';

/**
 * Shared source of truth for dashboard insights + derived per-vehicle health
 * alerts. Introduced in V4.6.56 to fix the long-standing bug where the
 * RightSidebar "Vehicle Alerts", the Dashboard Vehicle-Alerts tile / popup,
 * and the BusinessInsightsBox pointer all derived their state from the
 * persisted `Vehicle.healthStatus` column (manually set, usually stale) and
 * from `v.alert` (never populated by the backend), so a vehicle with a real
 * CRITICAL "service overdue" + WARNING "battery" finding would render
 * nothing in any of the three surfaces.
 *
 * With this context, every surface subscribes to the same
 * `/organizations/:orgId/dashboard-insights` feed — the same feed that
 * powers the detectors (`BatteryCriticalDetector`, `ServiceOverdueDetector`)
 * — and reads the severity + reasons the detector already computed.
 */

export type InsightSeverity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';

export type InsightType =
  | 'TIGHT_HANDOVER'
  | 'RETURN_NEEDS_INSPECTION'
  | 'STATION_SHORTAGE'
  | 'LOW_UTILIZATION'
  | 'SERVICE_WINDOW'
  | 'SERVICE_BEFORE_BOOKING'
  | 'BATTERY_CRITICAL'
  | 'SERVICE_OVERDUE'
  | 'PICKUP_OVERDUE';

export interface InsightEntityBreakdown {
  id: string;
  severity?: InsightSeverity;
  title?: string;
  message?: string;
  metrics?: Record<string, unknown> | null;
  reasons?: string[] | null;
}

export interface DashboardInsight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  priority: number;
  title: string;
  message: string;
  actionLabel?: string | null;
  actionType?: string | null;
  entityScope?: string;
  entityIds?: string[] | null;
  timeContext?: Record<string, string> | null;
  metrics?: Record<string, unknown> | null;
  reasons?: string[] | null;
  isGrouped: boolean;
  groupCount: number;
  createdAt: string;
}

export interface InsightsResponse {
  generatedAt: string;
  summary: { total: number; critical: number; warning: number; opportunity: number; info: number };
  insights: DashboardInsight[];
}

export type VehicleAlertSeverity = 'critical' | 'warning' | 'info';
export type VehicleAlertKind = 'BATTERY_CRITICAL' | 'SERVICE_OVERDUE';

/** Per-vehicle health alert row derived from DashboardInsights. */
export interface VehicleHealthAlert {
  vehicleId: string;
  vehicle: VehicleData | null;
  severity: VehicleAlertSeverity;
  kinds: VehicleAlertKind[];
  primaryReason: string;
  secondaryReasons: string[];
  license?: string;
  model?: string;
  station?: string;
}

interface DashboardInsightsContextValue {
  response: InsightsResponse | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  /** Raw insights array (may be empty). */
  insights: DashboardInsight[];
}

const EMPTY_RESPONSE: InsightsResponse = {
  generatedAt: new Date(0).toISOString(),
  summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
  insights: [],
};

const DashboardInsightsCtx = createContext<DashboardInsightsContextValue>({
  response: null,
  loading: true,
  error: false,
  refresh: async () => {},
  insights: [],
});

const REFRESH_MS = 5 * 60_000;

export function DashboardInsightsProvider({ children }: { children: ReactNode }) {
  const { orgId } = useRentalOrg();
  const [response, setResponse] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setResponse(null);
      setLoading(false);
      setError(false);
      return;
    }
    try {
      const res = await api.dashboardInsights.get(orgId);
      if (res && typeof res === 'object' && Array.isArray((res as InsightsResponse).insights)) {
        setResponse(res as InsightsResponse);
      } else {
        setResponse(EMPTY_RESPONSE);
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    const handle = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(handle);
  }, [orgId, refresh]);

  const value = useMemo<DashboardInsightsContextValue>(
    () => ({
      response,
      loading,
      error,
      refresh,
      insights: response?.insights ?? [],
    }),
    [response, loading, error, refresh],
  );

  return <DashboardInsightsCtx.Provider value={value}>{children}</DashboardInsightsCtx.Provider>;
}

export function useDashboardInsights() {
  return useContext(DashboardInsightsCtx);
}

// ─── Derivation helpers ────────────────────────────────────────────────

const VEHICLE_HEALTH_TYPES: ReadonlySet<InsightType> = new Set<InsightType>([
  'BATTERY_CRITICAL',
  'SERVICE_OVERDUE',
]);

const SEVERITY_RANK: Record<VehicleAlertSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function toLowerSeverity(s: InsightSeverity | undefined): VehicleAlertSeverity {
  if (s === 'CRITICAL') return 'critical';
  if (s === 'WARNING') return 'warning';
  return 'info';
}

function normalizeReason(r: string | null | undefined): string | null {
  if (!r) return null;
  const trimmed = r.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reduce all BATTERY_CRITICAL + SERVICE_OVERDUE insights into one row per
 * vehicle. Walks the persisted `metrics.entities[]` breakdown first (grouped
 * insights ship per-vehicle severity + reasons there), falling back to the
 * top-level insight metadata for ungrouped candidates (single-vehicle
 * insights where `entityIds = [vehicleId]`). Severity is the max across all
 * contributing insights.
 */
export function deriveVehicleHealthAlerts(
  insights: DashboardInsight[],
  fleetVehicles: VehicleData[],
): VehicleHealthAlert[] {
  const vehicleById = new Map<string, VehicleData>();
  for (const v of fleetVehicles) vehicleById.set(v.id, v);

  type Accumulator = {
    severity: VehicleAlertSeverity;
    kinds: Set<VehicleAlertKind>;
    reasons: string[];
  };
  const acc = new Map<string, Accumulator>();

  for (const insight of insights) {
    if (!VEHICLE_HEALTH_TYPES.has(insight.type)) continue;
    const kind = insight.type as VehicleAlertKind;

    const entityBreakdown = Array.isArray(insight.metrics?.entities)
      ? (insight.metrics?.entities as InsightEntityBreakdown[])
      : null;

    const pushAlert = (
      vehicleId: string,
      severity: VehicleAlertSeverity,
      primaryReason: string | null,
      extraReasons: string[],
    ) => {
      const current = acc.get(vehicleId);
      const collectedReasons: string[] = current ? [...current.reasons] : [];
      const pr = normalizeReason(primaryReason);
      if (pr && !collectedReasons.includes(pr)) collectedReasons.push(pr);
      for (const r of extraReasons) {
        const nr = normalizeReason(r);
        if (nr && !collectedReasons.includes(nr)) collectedReasons.push(nr);
      }

      if (!current) {
        acc.set(vehicleId, {
          severity,
          kinds: new Set([kind]),
          reasons: collectedReasons,
        });
        return;
      }
      current.kinds.add(kind);
      current.reasons = collectedReasons;
      if (SEVERITY_RANK[severity] > SEVERITY_RANK[current.severity]) {
        current.severity = severity;
      }
    };

    if (entityBreakdown && entityBreakdown.length > 0) {
      for (const entity of entityBreakdown) {
        if (!entity.id) continue;
        const severity = toLowerSeverity(entity.severity ?? insight.severity);
        const primary = entity.reasons?.[0] ?? entity.message ?? insight.reasons?.[0] ?? insight.title;
        const rest = (entity.reasons ?? []).slice(1);
        pushAlert(entity.id, severity, primary ?? null, rest);
      }
    } else {
      const ids = insight.entityIds ?? [];
      for (const vehicleId of ids) {
        const primary = insight.reasons?.[0] ?? insight.message ?? insight.title;
        const rest = (insight.reasons ?? []).slice(1);
        pushAlert(vehicleId, toLowerSeverity(insight.severity), primary ?? null, rest);
      }
    }
  }

  const rows: VehicleHealthAlert[] = [];
  for (const [vehicleId, entry] of acc) {
    const vehicle = vehicleById.get(vehicleId) ?? null;
    const fallbackLabel = vehicle
      ? vehicle.license || vehicle.model || vehicleId
      : vehicleId.slice(0, 8);
    const [primaryReason, ...rest] = entry.reasons.length > 0 ? entry.reasons : [fallbackLabel];
    rows.push({
      vehicleId,
      vehicle,
      severity: entry.severity,
      kinds: Array.from(entry.kinds),
      primaryReason: primaryReason ?? fallbackLabel,
      secondaryReasons: rest,
      license: vehicle?.license,
      model: vehicle?.model,
      station: vehicle?.station,
    });
  }

  rows.sort((a, b) => {
    const byRank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (byRank !== 0) return byRank;
    const la = (a.license || a.model || '').toLowerCase();
    const lb = (b.license || b.model || '').toLowerCase();
    return la.localeCompare(lb);
  });

  return rows;
}

/** Convenience hook: derive alerts from context + provided fleet snapshot. */
export function useVehicleHealthAlerts(fleetVehicles: VehicleData[]): {
  alerts: VehicleHealthAlert[];
  loading: boolean;
  error: boolean;
  counts: { critical: number; warning: number; info: number; total: number };
} {
  const { insights, loading, error } = useDashboardInsights();
  const alerts = useMemo(
    () => deriveVehicleHealthAlerts(insights, fleetVehicles),
    [insights, fleetVehicles],
  );
  const counts = useMemo(
    () => ({
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      info: alerts.filter((a) => a.severity === 'info').length,
      total: alerts.length,
    }),
    [alerts],
  );
  return { alerts, loading, error, counts };
}
