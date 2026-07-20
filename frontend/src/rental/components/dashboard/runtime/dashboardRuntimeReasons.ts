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
  reasonCode?: string;
  serviceCaseId?: string;
  status?: string;
  scheduledAt?: string | null;
  expectedReadyAt?: string | null;
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

export function runtimeReasonDedupeKey(
  reason: Pick<RuntimeReason, 'category' | 'source' | 'title' | 'serviceCaseId'>,
): string {
  return [
    reason.category,
    normalizeToken(reason.source),
    normalizeToken(reason.serviceCaseId),
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
    normalizeToken(input.serviceCaseId),
    normalizeToken(title),
  ].join(':');

  return {
    id,
    category: input.category,
    severity: input.severity,
    title,
    description: input.description?.trim() || undefined,
    source,
    reasonCode: input.reasonCode?.trim() || undefined,
    serviceCaseId: input.serviceCaseId?.trim() || undefined,
    status: input.status?.trim() || undefined,
    scheduledAt: input.scheduledAt ?? undefined,
    expectedReadyAt: input.expectedReadyAt ?? undefined,
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
    case 'DRIVING_ASSESSMENT_DEVICE_QUALITY':
      return 'health';
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

/** Legal compliance only (TÜV / BOKraft). Service/maintenance is never compliance. */
export function isComplianceCategory(category: RuntimeReasonCategory): boolean {
  return category === 'compliance';
}

export function isServiceCategory(category: RuntimeReasonCategory): boolean {
  return category === 'service';
}

export function isLegalComplianceBlockingText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('tüv') ||
    normalized.includes('tuv') ||
    normalized.includes('bokraft')
  );
}

export function isServiceOverdueReason(
  reason: Pick<RuntimeReason, 'category' | 'title' | 'description' | 'source'>,
): boolean {
  if (reason.category !== 'service') return false;
  const text = `${reason.title} ${reason.description ?? ''}`.toLowerCase();
  if (text.includes('überfällig') || text.includes('overdue')) return true;
  if (reason.source?.includes('SERVICE_OVERDUE')) return true;
  if (
    reason.source?.includes('service_compliance') &&
    (text.includes('überfällig') || text.includes('overdue') || text.includes('hm/oem'))
  ) {
    return true;
  }
  return false;
}

export function serviceOverdueCanonicalKey(vehicleId: string): string {
  return `${vehicleId}:service:service_overdue`;
}

function serviceOverdueReasonScore(
  reason: Pick<RuntimeReason, 'title' | 'description' | 'source'>,
): number {
  let score = reason.title.length;
  if (reason.title.includes('HM/OEM') || reason.title.includes('(')) score += 50;
  if (reason.source?.includes('service_compliance')) score += 100;
  if (reason.description && reason.description.length > reason.title.length) score += 20;
  return score;
}

/** Keep the most specific service-overdue row when generic duplicates exist. */
export function pickPreferredServiceOverdueReason(
  reasons: RuntimeReason[],
): RuntimeReason {
  return [...reasons].sort(
    (a, b) => serviceOverdueReasonScore(b) - serviceOverdueReasonScore(a),
  )[0];
}

export function dedupeServiceOverdueCriticalReasons(reasons: RuntimeReason[]): RuntimeReason[] {
  const overdue = reasons.filter(isServiceOverdueReason);
  if (overdue.length <= 1) return reasons;
  const other = reasons.filter((reason) => !isServiceOverdueReason(reason));
  return [...other, pickPreferredServiceOverdueReason(overdue)];
}

export function canonicalCriticalReasonKey(
  vehicleId: string,
  reason: RuntimeReason,
): string {
  if (isServiceOverdueReason(reason)) {
    return serviceOverdueCanonicalKey(vehicleId);
  }
  return `${vehicleId}:${runtimeReasonDedupeKey(reason)}`;
}
