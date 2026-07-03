import type {
  OperationalIssue,
  OperationalIssueDomain,
  OperationalIssueDraft,
  OperationalIssueSeverity,
  OperationalIssueVisibility,
} from './operationalIssueTypes';
import { getDefaultOperationalIssueVisibility } from './operationalIssueVisibility';

/**
 * OperationalIssue is the single source of truth for platform-wide operational messages.
 *
 * Canonical severity bands (user-facing):
 * - critical — act now, blocking, safety-critical, offline ≥ critical threshold, service massively overdue
 * - warning — check soon / observe / review required with operative follow-up
 * - notice — information or data note without direct operative action (stored as `attention` in code)
 * - info — low-risk system hint
 * - good — no issue; excluded from notifications
 */
export const OPERATIONAL_ISSUE_SINGLE_SOURCE_CONTRACT =
  'OperationalIssue is the single source of truth for platform-wide operational messages.';

export type CanonicalSeverityBand = 'critical' | 'warning' | 'notice' | 'info' | 'good';

export interface RentalHealthModuleLike {
  state: string;
  reason?: string | null;
  label?: string | null;
}

const OVERDUE_TEXT =
  /overdue|ueberfaellig|überfällig|abgelaufen|massiv|seit\s+\d+\s+tag/i;

const HM_OEM_NO_TRACKING_TEXT =
  /kein hm\/oem|no hm\/oem|hm\/oem.*(nicht|kein|no|missing|unavailable|verf[uü]gbar)|kein.*service-?tracking|no.*service-?tracking|service-?tracking.*(missing|unavailable|nicht|verf[uü]gbar)|no tracking|kein tracking|tracking nicht verf[uü]gbar/i;

/** Semantic key for the org-wide grouped dashboard data note (not per-vehicle). */
export const HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY =
  'org:data_quality:hm_oem_service_tracking_missing';

export const HM_OEM_SERVICE_TRACKING_DATA_NOTE_LABEL_DE = 'Service-Tracking nicht verfügbar';
export const HM_OEM_SERVICE_TRACKING_DATA_NOTE_LABEL_EN = 'Service tracking unavailable';

const ISSUE_TYPE_SEVERITY: Record<string, OperationalIssueSeverity> = {
  tire_monitor: 'warning',
  tire_observe: 'warning',
  monitor_tires: 'warning',
  check_soon: 'warning',
  tire_critical: 'critical',
  tires_critical: 'critical',
  battery_warning: 'warning',
  battery_critical: 'critical',
  brake_warning: 'warning',
  brake_critical: 'critical',
  brakes_warning: 'warning',
  brakes_critical: 'critical',
  error_codes_active: 'warning',
  warning_light_active: 'warning',
  service_overdue: 'critical',
  service_due_soon: 'warning',
  service_window_available: 'attention',
  hm_oem_service_tracking_missing: 'info',
  service_tracking_missing: 'info',
  telemetry_soft_offline: 'attention',
  telemetry_offline: 'critical',
  telemetry_unknown: 'info',
  obd_unplugged: 'warning',
  obd_unplugged_during_rental: 'critical',
  rental_blocked: 'critical',
  available_not_ready: 'warning',
  pickup_overdue: 'critical',
  return_overdue: 'critical',
  return_inspection_required: 'warning',
  cold_engine_abuse: 'warning',
  damage_suspicion: 'warning',
  impact_suspicion: 'warning',
  receivable_overdue: 'warning',
  payment_failed: 'critical',
};

const DATA_AVAILABILITY_ISSUE_TYPES = new Set([
  'hm_oem_service_tracking_missing',
  'service_tracking_missing',
  'module_data_delayed',
  'module_data_unavailable',
]);

const FINANCE_ISSUE_TYPES = new Set([
  'receivable_overdue',
  'payment_failed',
  'invoice_overdue',
  'low_utilization',
]);

export function isOverdueIssueText(text: string | null | undefined): boolean {
  if (!text) return false;
  return OVERDUE_TEXT.test(text);
}

export function isHmOemServiceTrackingMissingIssue(
  issue: Pick<OperationalIssue, 'issueType' | 'semanticKey' | 'title' | 'subtitle'>,
): boolean {
  if (
    issue.issueType === 'hm_oem_service_tracking_missing'
    || issue.issueType === 'service_tracking_missing'
  ) {
    return true;
  }
  if (issue.semanticKey?.includes('hm_oem_service_tracking_missing')) return true;
  const text = `${issue.title ?? ''} ${issue.subtitle ?? ''}`;
  return isHmOemServiceTrackingMissingText(text);
}

export function hmOemServiceTrackingDataNoteSubtitle(locale: string): string {
  return locale === 'de'
    ? HM_OEM_SERVICE_TRACKING_DATA_NOTE_LABEL_DE
    : HM_OEM_SERVICE_TRACKING_DATA_NOTE_LABEL_EN;
}

export function formatHmOemServiceTrackingGroupedTitle(
  vehicleCount: number,
  locale: string,
): string {
  const de = locale === 'de';
  if (vehicleCount <= 0) return hmOemServiceTrackingDataNoteSubtitle(locale);
  if (de) {
    return vehicleCount === 1
      ? '1 Fahrzeug ohne HM/OEM Service-Tracking'
      : `${vehicleCount} Fahrzeuge ohne HM/OEM Service-Tracking`;
  }
  return vehicleCount === 1
    ? '1 vehicle without HM/OEM service tracking'
    : `${vehicleCount} vehicles without HM/OEM service tracking`;
}

export function collectHmOemServiceTrackingVehicleIds(
  issues: Array<Pick<OperationalIssue, 'issueType' | 'vehicleId' | 'semanticKey' | 'title' | 'subtitle'>>,
  excludeVehicleIds: ReadonlySet<string> = new Set(),
): string[] {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (!isHmOemServiceTrackingMissingIssue(issue)) continue;
    if (!issue.vehicleId || excludeVehicleIds.has(issue.vehicleId)) continue;
    ids.add(issue.vehicleId);
  }
  return Array.from(ids);
}

export function isHmOemServiceTrackingMissingText(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = String(text).toLowerCase();
  if (isOverdueIssueText(normalized)) return false;
  return HM_OEM_NO_TRACKING_TEXT.test(normalized);
}

export function isDataAvailabilityIssueType(issueType: string): boolean {
  return DATA_AVAILABILITY_ISSUE_TYPES.has(issueType);
}

export function isFinanceIssueType(issueType: string, domain?: OperationalIssueDomain): boolean {
  if (domain === 'finance') return true;
  return FINANCE_ISSUE_TYPES.has(issueType);
}

export function canonicalSeverityBand(
  severity: OperationalIssueSeverity,
): Exclude<CanonicalSeverityBand, 'good'> {
  if (severity === 'attention') return 'notice';
  return severity;
}

export function noticeToAttentionSeverity(
  band: CanonicalSeverityBand,
): OperationalIssueSeverity | null {
  switch (band) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'notice':
      return 'attention';
    case 'info':
      return 'info';
    case 'good':
      return null;
  }
}

export function resolveCanonicalIssueType(input: {
  issueType: string;
  domain: OperationalIssueDomain;
  title?: string | null;
  subtitle?: string | null;
  reason?: string | null;
  module?: string | null;
}): {
  issueType: string;
  domain: OperationalIssueDomain;
  severity: OperationalIssueSeverity;
} {
  const text = [input.title, input.subtitle, input.reason].filter(Boolean).join(' ');
  const issueType = input.issueType.toLowerCase();
  const module = (input.module ?? '').toLowerCase();

  if (
    (issueType.includes('service_tracking') || module === 'service_compliance')
    && isHmOemServiceTrackingMissingText(text)
  ) {
    return {
      issueType: 'hm_oem_service_tracking_missing',
      domain: 'data_quality',
      severity: 'info',
    };
  }

  if (issueType.includes('service_tracking') && !isOverdueIssueText(text)) {
    return {
      issueType: 'service_tracking_missing',
      domain: 'data_quality',
      severity: 'info',
    };
  }

  const mappedSeverity = ISSUE_TYPE_SEVERITY[issueType];
  if (mappedSeverity) {
    return {
      issueType: input.issueType,
      domain: input.domain,
      severity: mappedSeverity,
    };
  }

  if (issueType.includes('tire') && issueType.includes('monitor')) {
    return { issueType: input.issueType, domain: input.domain, severity: 'warning' };
  }

  if (issueType.includes('telemetry') && issueType.includes('soft')) {
    return { issueType: input.issueType, domain: input.domain, severity: 'attention' };
  }

  if (issueType.includes('telemetry') && issueType.includes('offline')) {
    return { issueType: input.issueType, domain: input.domain, severity: 'critical' };
  }

  return {
    issueType: input.issueType,
    domain: input.domain,
    severity: 'attention',
  };
}

export function resolveCanonicalVisibility(
  issueType: string,
  domain: OperationalIssueDomain,
  base?: OperationalIssueVisibility,
): OperationalIssueVisibility {
  const visibility = base ?? getDefaultOperationalIssueVisibility(domain, issueType);
  const normalizedType = issueType.toLowerCase();

  if (isFinanceIssueType(normalizedType, domain)) {
    return {
      ...visibility,
      dashboardAttention: false,
      fleetCommand: false,
      finance: true,
    };
  }

  if (
    isDataAvailabilityIssueType(normalizedType)
    || normalizedType === 'hm_oem_service_tracking_missing'
    || normalizedType === 'service_tracking_missing'
  ) {
    return {
      ...visibility,
      dashboardAttention: false,
      fleetCommand: false,
      vehicleOverview: false,
      vehicleHealth: true,
      debug: true,
    };
  }

  if (normalizedType === 'telemetry_soft_offline') {
    return {
      ...visibility,
      dashboardAttention: true,
      fleetCommand: true,
      vehicleOverview: true,
    };
  }

  if (normalizedType === 'tire_monitor' || normalizedType === 'monitor_tires') {
    return {
      ...visibility,
      dashboardAttention: true,
      fleetCommand: true,
      vehicleOverview: true,
      vehicleHealth: true,
    };
  }

  return visibility;
}

export function shouldShowInDashboardAttention(issue: Pick<OperationalIssue, 'issueType' | 'domain' | 'visibility'>): boolean {
  if (!issue.visibility.dashboardAttention) return false;
  if (isFinanceIssueType(issue.issueType, issue.domain)) return false;
  if (isDataAvailabilityIssueType(issue.issueType)) return false;
  if (issue.issueType === 'hm_oem_service_tracking_missing') return false;
  return true;
}

export function isOperativeRentalHealthModule(
  moduleKey: string,
  module: RentalHealthModuleLike,
): boolean {
  if (module.state !== 'critical' && module.state !== 'warning') return false;
  const text = `${module.reason ?? ''} ${module.label ?? ''}`;
  if (isHmOemServiceTrackingMissingText(text)) return false;
  if (
    moduleKey === 'service_compliance'
    && isHmOemServiceTrackingMissingText(text)
    && !isOverdueIssueText(text)
  ) {
    return false;
  }
  return true;
}

export function operativeSeverityFromRentalModule(
  moduleKey: string,
  module: RentalHealthModuleLike,
): OperationalIssueSeverity | null {
  if (!isOperativeRentalHealthModule(moduleKey, module)) return null;
  if (module.state === 'critical') return 'critical';
  if (moduleKey === 'tires') return 'warning';
  if (moduleKey === 'service_compliance' && isOverdueIssueText(module.reason ?? '')) return 'critical';
  return 'warning';
}

export function applyCanonicalTaxonomyToDraft(draft: OperationalIssueDraft): OperationalIssueDraft | null {
  const canonical = resolveCanonicalIssueType({
    issueType: draft.issueType,
    domain: draft.domain,
    title: draft.title,
    subtitle: draft.subtitle,
    reason: draft.subtitle,
    module: draft.source.rawType,
  });

  if (isFinanceIssueType(canonical.issueType, canonical.domain)) {
    return null;
  }

  const visibility = resolveCanonicalVisibility(
    canonical.issueType,
    canonical.domain,
    draft.visibility,
  );

  if (
    isDataAvailabilityIssueType(canonical.issueType)
    && !visibility.dashboardAttention
    && !visibility.vehicleHealth
    && !visibility.fleetCommand
    && !visibility.vehicleOverview
  ) {
    return null;
  }

  return {
    ...draft,
    issueType: canonical.issueType,
    domain: canonical.domain,
    severity: canonical.severity,
    visibility,
  };
}

export function applyCanonicalTaxonomyToIssue(issue: OperationalIssue): OperationalIssue {
  const canonical = resolveCanonicalIssueType({
    issueType: issue.issueType,
    domain: issue.domain,
    title: issue.title,
    subtitle: issue.subtitle,
    module: issue.primarySource.rawType,
  });

  return {
    ...issue,
    issueType: canonical.issueType,
    domain: canonical.domain,
    severity: canonical.severity,
    visibility: resolveCanonicalVisibility(canonical.issueType, canonical.domain, issue.visibility),
  };
}
