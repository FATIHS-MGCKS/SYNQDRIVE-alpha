import type {
  RuntimeReason,
  RuntimeReasonCategory,
  RuntimeReasonSeverity,
} from './dashboardRuntimeTypes';

export interface RuntimeReasonInput {
  category: RuntimeReasonCategory;
  severity: RuntimeReasonSeverity;
  title: string;
  description?: string;
  source?: string;
  blocking?: boolean;
  preventsReady?: boolean;
  actionLabel?: string;
  actionTarget?: string;
}

function normalizeToken(value: string | undefined): string {
  return (value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

export function runtimeReasonDedupeKey(reason: Pick<RuntimeReason, 'category' | 'source' | 'title'>): string {
  return [
    reason.category,
    normalizeToken(reason.source),
    normalizeToken(reason.title),
  ].join(':');
}

export function createRuntimeReason(input: RuntimeReasonInput): RuntimeReason {
  const source = input.source?.trim() || undefined;
  const title = input.title.trim();
  const id = [
    input.category,
    input.severity,
    normalizeToken(source),
    normalizeToken(title),
  ].join(':');

  return {
    id,
    category: input.category,
    severity: input.severity,
    title,
    description: input.description?.trim() || undefined,
    source,
    blocking: input.blocking,
    preventsReady: input.preventsReady,
    actionLabel: input.actionLabel?.trim() || undefined,
    actionTarget: input.actionTarget?.trim() || undefined,
  };
}

export function dedupeRuntimeReasons(reasons: RuntimeReason[]): RuntimeReason[] {
  const seen = new Set<string>();
  const result: RuntimeReason[] = [];

  for (const reason of reasons) {
    const key = runtimeReasonDedupeKey(reason);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(reason);
  }

  return result;
}

export function categoryFromInsightType(type: string | undefined): RuntimeReasonCategory {
  switch (type) {
    case 'BATTERY_CRITICAL':
      return 'battery';
    case 'TIRE_CRITICAL':
      return 'tires';
    case 'BRAKE_CRITICAL':
      return 'brakes';
    case 'SERVICE_OVERDUE':
    case 'SERVICE_BEFORE_BOOKING':
    case 'SERVICE_WINDOW':
      return 'service';
    case 'TUV_OVERDUE':
    case 'BOKRAFT_OVERDUE':
      return 'compliance';
    case 'PICKUP_OVERDUE':
    case 'RETURN_NEEDS_INSPECTION':
    case 'TIGHT_HANDOVER':
      return 'handover';
    case 'STATION_SHORTAGE':
      return 'operational';
    default:
      return 'unknown';
  }
}

export function categoryFromHealthModule(module: string | undefined): RuntimeReasonCategory {
  switch (module) {
    case 'battery':
      return 'battery';
    case 'tires':
      return 'tires';
    case 'brakes':
      return 'brakes';
    case 'error_codes':
      return 'dtc';
    case 'service_compliance':
      return 'service';
    case 'complaints':
      return 'damage';
    case 'vehicle_alerts':
      return 'health';
    default:
      return 'health';
  }
}

export function isComplianceCategory(category: RuntimeReasonCategory): boolean {
  return category === 'compliance' || category === 'service';
}
