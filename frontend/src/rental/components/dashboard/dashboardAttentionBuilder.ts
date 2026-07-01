import type { DashboardInsight, InsightType } from '../../DashboardInsightsContext';
import {
  isServiceOverdueKey,
  normalizeOperationalIssues,
  type OperationalIssue,
} from '../../lib/operational-issues';
import type { ActionQueueItem } from './dashboardTypes';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';
import type { BuildActionQueueInput } from './actionQueueBuilder';
import type { DashboardRuntimeModel, VehicleRuntimeState } from './runtime';

const RUNTIME_INSIGHT_TYPES = new Set<InsightType>([
  'BATTERY_CRITICAL',
  'SERVICE_OVERDUE',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
  'PICKUP_OVERDUE',
  'RETURN_OVERDUE',
  'RETURN_NEEDS_INSPECTION',
]);

const RUNTIME_PREDICTIVE_TYPES = new Set<string>([
  'SERVICE_WINDOW',
  'SOFT_OFFLINE_TELEMETRY_CHECK',
  'RETURN_OVERDUE_THREATENS_FOLLOWUP',
  'STATION_SHORTAGE_24H',
]);

function normalizeTitle(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function runtimeVehicleIds(runtime: DashboardRuntimeModel): Set<string> {
  return new Set(runtime.vehicleStates.map((state) => state.vehicleId));
}

function runtimeHasInsightCoverage(
  insight: DashboardInsight,
  statesByVehicle: Map<string, VehicleRuntimeState>,
): boolean {
  if (!RUNTIME_INSIGHT_TYPES.has(insight.type)) return false;
  const entityIds = insight.entityIds?.filter(Boolean) ?? [];
  if (entityIds.length === 0) return false;
  return entityIds.every((vehicleId) => statesByVehicle.has(vehicleId));
}

function predictiveVehicleId(insight: PredictiveOperationsInsight): string | undefined {
  if (insight.vehicleId) return insight.vehicleId;
  if (insight.affectedEntity?.kind === 'vehicle') return insight.affectedEntity.vehicleId;
  return undefined;
}

function runtimeHasPredictiveCoverage(
  insight: PredictiveOperationsInsight,
  statesByVehicle: Map<string, VehicleRuntimeState>,
): boolean {
  if (!RUNTIME_PREDICTIVE_TYPES.has(insight.type)) return false;
  const vehicleId = predictiveVehicleId(insight);
  if (!vehicleId) return false;
  const state = statesByVehicle.get(vehicleId);
  if (!state) return false;
  if (insight.type === 'SOFT_OFFLINE_TELEMETRY_CHECK') {
    return state.telemetryState === 'soft_offline';
  }
  if (String(insight.type) === 'SERVICE_WINDOW') {
    return state.criticalReasons.some((reason) => reason.source?.includes('SERVICE_WINDOW'))
      || state.warningReasons.some((reason) => reason.source?.includes('SERVICE_WINDOW'));
  }
  return true;
}

export function filterInsightsForRuntimeAttention(
  insights: DashboardInsight[],
  runtime: DashboardRuntimeModel,
): DashboardInsight[] {
  const statesByVehicle = new Map(runtime.vehicleStates.map((state) => [state.vehicleId, state]));
  return insights.filter((insight) => !runtimeHasInsightCoverage(insight, statesByVehicle));
}

export function filterPredictiveForRuntimeAttention(
  insights: PredictiveOperationsInsight[],
  runtime: DashboardRuntimeModel,
): PredictiveOperationsInsight[] {
  const statesByVehicle = new Map(runtime.vehicleStates.map((state) => [state.vehicleId, state]));
  return insights.filter((insight) => !runtimeHasPredictiveCoverage(insight, statesByVehicle));
}

export function buildRuntimeOperationalIssues(
  input: BuildActionQueueInput,
): OperationalIssue[] {
  const runtime = input.dashboardRuntime;
  if (!runtime) return [];

  return normalizeOperationalIssues({
    vehicleRuntimeStates: runtime.vehicleStates,
    vehicleHealthAlerts: [],
    dashboardInsights: filterInsightsForRuntimeAttention(input.insights, runtime),
    predictiveInsights: filterPredictiveForRuntimeAttention(input.predictiveInsights, runtime),
    vehiclesById: input.fleetById,
  }).filter(
    // Finance/revenue/invoices belong to Business Pulse — not operational ActionQueue.
    (issue) => issue.visibility.dashboardAttention && issue.domain !== 'finance',
  );
}

function mergeAttentionItem(existing: ActionQueueItem, incoming: ActionQueueItem): ActionQueueItem {
  const existingTitle = normalizeTitle(existing.title);
  const incomingTitle = normalizeTitle(incoming.title);
  const keepIncoming =
    incomingTitle.length > existingTitle.length
    || (incomingTitle.includes(existingTitle) && incomingTitle.length > existingTitle.length);

  const primary = keepIncoming ? incoming : existing;
  const secondary = keepIncoming ? existing : incoming;

  return {
    ...primary,
    priority: Math.max(existing.priority, incoming.priority),
    severity:
      existing.severity === 'critical' || incoming.severity === 'critical'
        ? 'critical'
        : existing.severity === 'warning' || incoming.severity === 'warning'
          ? 'warning'
          : primary.severity,
    reason: primary.reason || secondary.reason,
    detail: primary.detail || secondary.detail,
    isOverdue: existing.isOverdue || incoming.isOverdue,
  };
}

function suppressDominatedAttentionTitles(items: ActionQueueItem[]): ActionQueueItem[] {
  const sorted = [...items].sort((a, b) => normalizeTitle(b.title).length - normalizeTitle(a.title).length);
  const kept: ActionQueueItem[] = [];
  const keptTitles: string[] = [];

  for (const item of sorted) {
    const title = normalizeTitle(item.title);
    if (!title) {
      kept.push(item);
      continue;
    }

    const dominated = keptTitles.some(
      (keptTitle) => keptTitle !== title && keptTitle.includes(title) && keptTitle.length > title.length,
    );
    if (dominated) continue;

    const replaceIndices: number[] = [];
    keptTitles.forEach((keptTitle, index) => {
      if (keptTitle !== title && title.includes(keptTitle) && title.length > keptTitle.length) {
        replaceIndices.push(index);
      }
    });

    if (replaceIndices.length > 0) {
      for (let i = replaceIndices.length - 1; i >= 0; i -= 1) {
        kept.splice(replaceIndices[i]!, 1);
        keptTitles.splice(replaceIndices[i]!, 1);
      }
    }

    kept.push(item);
    keptTitles.push(title);
  }

  return kept.sort((a, b) => b.priority - a.priority || a.timeSortMs - b.timeSortMs);
}

/**
 * Deduplicates canonical attention rows after runtime normalization.
 * Merges exact semantic keys and drops generic titles dominated by a more specific sibling.
 */
export function normalizeAttentionItems(items: ActionQueueItem[]): ActionQueueItem[] {
  const byKey = new Map<string, ActionQueueItem>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.semanticKey ?? item.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      order.push(key);
      continue;
    }
    byKey.set(key, mergeAttentionItem(existing, item));
  }

  const merged = order.map((key) => byKey.get(key)!);
  return suppressDominatedAttentionTitles(
    merged.filter((item) => {
      if (item.category !== 'health' || item.module === 'service_compliance') return true;
      if (!item.vehicleId) return true;
      const hasSpecificService = merged.some((other) =>
        other.id !== item.id
        && other.vehicleId === item.vehicleId
        && (other.module === 'service_compliance' || isServiceOverdueKey(other.semanticKey ?? ''))
        && normalizeTitle(other.title).includes('service'),
      );
      if (!hasSpecificService) return true;
      return !normalizeTitle(item.title).includes('service');
    }),
  );
}

export function attentionCountLabel(count: number, de: boolean): string {
  if (de) return count === 1 ? '1 Meldung' : `${count} Meldungen`;
  return count === 1 ? '1 alert' : `${count} alerts`;
}

export function attentionVisibleLabel(visible: number, total: number, de: boolean): string | null {
  if (visible >= total) return null;
  if (de) return `${visible} von ${total} Meldungen`;
  return `${visible} of ${total} alerts`;
}

export function usesRuntimeAttentionSource(runtime: DashboardRuntimeModel | undefined): boolean {
  return Boolean(runtime && runtime.vehicleStates.length > 0);
}

export function runtimeBackedVehicleIds(runtime: DashboardRuntimeModel | undefined): Set<string> {
  if (!runtime) return new Set();
  return runtimeVehicleIds(runtime);
}
