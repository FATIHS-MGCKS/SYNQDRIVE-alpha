import {
  createBookingIssueKey,
  createTripIssueKey,
  createVehicleIssueKey,
  isServiceWindowKey,
  serviceOverdueKeyForVehicle,
} from './operationalIssueKeys';
import {
  formatOperationalIssueSubtitle,
  formatOperationalIssueTitle,
  formatVehicleIssueEntityLabel,
  sanitizeUserFacingIssueText,
} from './operationalIssueLabels';
import {
  choosePrimaryIssueSource,
  getOperationalIssueSourcePriority,
  mergeIssueSources,
  uniqueSources,
} from './operationalIssueSources';
import { getDefaultOperationalIssueVisibility } from './operationalIssueVisibility';
import {
  applyCanonicalTaxonomyToDraft,
  applyCanonicalTaxonomyToIssue,
  isHmOemServiceTrackingMissingText,
} from './operationalIssueTaxonomy';
import { mapTireOperationalIssue } from './operationalIssueTireTaxonomy';
import type {
  DashboardInsightLike,
  OperationalIssue,
  OperationalIssueDraft,
  OperationalIssueEvidence,
  OperationalIssueNormalizationInput,
  OperationalIssueNormalizerOptions,
  OperationalIssueSeverity,
  OperationalIssueSource,
  OperationalIssueVehicleLike,
  MisuseCaseLike,
  PredictiveInsightLike,
  RuntimeReasonLike,
  VehicleHealthAlertLike,
  VehicleHealthAlertModuleLike,
  VehicleRuntimeStateLike,
} from './operationalIssueTypes';

const SEVERITY_RANK: Record<OperationalIssueSeverity, number> = {
  info: 1,
  attention: 2,
  warning: 3,
  critical: 4,
};

export function normalizeOperationalIssues(
  input: OperationalIssueNormalizationInput,
  options: OperationalIssueNormalizerOptions = {},
): OperationalIssue[] {
  const vehiclesById = asVehicleMap(input.vehiclesById);
  const drafts: OperationalIssueDraft[] = [];

  for (const state of input.vehicleRuntimeStates ?? []) {
    const vehicle = vehiclesById.get(state.vehicleId) ?? state;
    const reasons = collectRuntimeReasons(state);
    for (const reason of reasons) {
      const draft = runtimeReasonToIssueDraft(reason, state, vehicle);
      if (draft) drafts.push(draft);
    }
    const telemetryDraft = telemetryStateToIssueDraft(state, vehicle);
    if (telemetryDraft) drafts.push(telemetryDraft);
  }

  // Standalone runtime reasons are intentionally accepted for future callers,
  // but skipped until a vehicle/entity context is available. Dedupe must be
  // semantic; source+title without an entity is not a safe key.
  for (const reason of input.runtimeReasons ?? []) {
    void reason;
  }

  for (const insight of input.dashboardInsights ?? []) {
    drafts.push(...dashboardInsightToIssueDrafts(insight, vehiclesById));
  }

  for (const alert of input.vehicleHealthAlerts ?? []) {
    drafts.push(...vehicleHealthAlertToIssueDrafts(alert, vehiclesById));
  }

  for (const insight of input.predictiveInsights ?? []) {
    const draft = predictiveInsightToIssueDraft(insight, vehiclesById);
    if (draft) drafts.push(draft);
  }

  for (const misuseCase of input.misuseCases ?? []) {
    const draft = misuseCaseToIssueDraft(misuseCase);
    if (draft) drafts.push(draft);
  }

  return mergeDrafts(
    suppressHealthWhenServiceOverdue(
      suppressGenericHealthFallbacks(
        drafts
          .map((draft) => applyCanonicalTaxonomyToDraft(draft))
          .filter((draft): draft is OperationalIssueDraft => Boolean(draft)),
      ),
    ),
    options,
  );
}

function collectRuntimeReasons(state: VehicleRuntimeStateLike): RuntimeReasonLike[] {
  const seen = new Set<string>();
  const result: RuntimeReasonLike[] = [];
  for (const reason of [
    ...(state.criticalReasons ?? []),
    ...(state.blockReasons ?? []),
    ...(state.notReadyReasons ?? []),
    ...(state.warningReasons ?? []),
  ]) {
    const key = reason.id || `${reason.category}:${reason.title}:${reason.source ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(reason);
  }
  return result;
}

function runtimeReasonToIssueDraft(
  reason: RuntimeReasonLike,
  state: VehicleRuntimeStateLike,
  vehicle: OperationalIssueVehicleLike,
): OperationalIssueDraft | null {
  const vehicleId = state.vehicleId;
  const source = sourceFromRuntimeReason(reason);
  const mapped = mapRuntimeReason(reason, vehicleId);
  if (!mapped) return null;
  const title = mapped.title ?? reason.title;
  const subtitle = reason.description;
  return {
    semanticKey: mapped.semanticKey,
    domain: mapped.domain,
    issueType: mapped.issueType,
    severity: mapped.severity ?? runtimeReasonSeverity(reason),
    title,
    subtitle,
    entityLabel: formatVehicleIssueEntityLabel(vehicle),
    vehicleId,
    source,
    evidence: evidenceFromReason(reason),
    recommendedAction: reason.actionLabel,
    cta: reason.actionTarget && reason.actionLabel ? { label: reason.actionLabel, target: reason.actionTarget } : undefined,
  };
}

function telemetryStateToIssueDraft(
  state: VehicleRuntimeStateLike,
  vehicle: OperationalIssueVehicleLike,
): OperationalIssueDraft | null {
  if (state.telemetryState !== 'soft_offline' && state.telemetryState !== 'offline') return null;
  const offline = state.telemetryState === 'offline';
  return {
    semanticKey: createVehicleIssueKey(state.vehicleId, 'telemetry', offline ? 'offline' : 'soft_offline'),
    domain: 'telemetry',
    issueType: offline ? 'telemetry_offline' : 'telemetry_soft_offline',
    severity: offline ? 'critical' : 'attention',
    title: offline ? 'Offline' : 'Soft Offline',
    subtitle: offline ? 'Seit 48h kein Signal' : 'Seit 24h kein Signal',
    entityLabel: formatVehicleIssueEntityLabel(vehicle),
    vehicleId: state.vehicleId,
    source: { sourceType: 'runtime', rawType: state.telemetryState, debugLabel: 'vehicle-runtime' },
  };
}

function mapRuntimeReason(
  reason: RuntimeReasonLike,
  vehicleId: string,
): Pick<OperationalIssueDraft, 'semanticKey' | 'domain' | 'issueType' | 'severity' | 'title'> | null {
  const source = reason.source ?? '';
  const title = reason.title ?? '';
  const text = `${source} ${title} ${reason.description ?? ''}`.toLowerCase();
  const critical = reason.severity === 'critical' || reason.blocking === true;

  if ((reason.category === 'service' || reason.category === 'compliance') && isHmOemServiceTrackingMissingText(text)) {
    return {
      domain: 'data_quality',
      issueType: 'hm_oem_service_tracking_missing',
      semanticKey: createVehicleIssueKey(vehicleId, 'data_quality', 'hm_oem_service_tracking_missing'),
      severity: 'info',
      title: title || 'Service-Tracking nicht verfuegbar',
    };
  }
  if ((reason.category === 'service' || reason.category === 'compliance') && isOverdueText(text)) {
    return {
      domain: 'service_compliance',
      issueType: 'service_overdue',
      semanticKey: serviceOverdueKeyForVehicle(vehicleId),
      severity: 'critical',
      title,
    };
  }
  if (reason.category === 'service' || reason.category === 'compliance') {
    return {
      domain: 'service_compliance',
      issueType: critical ? 'service_overdue' : 'service_due_soon',
      semanticKey: createVehicleIssueKey(vehicleId, 'service_compliance', critical ? 'overdue' : 'due_soon'),
      severity: critical ? 'critical' : runtimeReasonSeverity(reason),
      title,
    };
  }
  if (reason.category === 'battery') {
    return {
      domain: 'vehicle_health',
      issueType: critical ? 'battery_critical' : 'battery_warning',
      semanticKey: createVehicleIssueKey(vehicleId, 'vehicle_health', critical ? 'battery_critical' : 'battery_warning'),
      severity: critical ? 'critical' : 'warning',
      title,
    };
  }
  if (reason.category === 'tires') {
    const mapped = mapTireOperationalIssue({
      moduleState: critical ? 'critical' : 'warning',
      title,
      reason: reason.description ?? title,
    });
    if (!mapped) return null;
    return {
      domain: 'vehicle_health',
      issueType: mapped.issueType,
      semanticKey: createVehicleIssueKey(vehicleId, 'vehicle_health', mapped.keyType),
      severity: mapped.severity,
      title,
    };
  }
  if (reason.category === 'brakes') {
    return {
      domain: 'vehicle_health',
      issueType: critical ? 'brake_critical' : 'brake_warning',
      semanticKey: createVehicleIssueKey(vehicleId, 'vehicle_health', critical ? 'brakes_critical' : 'brakes_warning'),
      severity: critical ? 'critical' : 'warning',
      title,
    };
  }
  if (reason.category === 'dtc') {
    return {
      domain: 'vehicle_health',
      issueType: 'error_codes_active',
      semanticKey: createVehicleIssueKey(vehicleId, 'vehicle_health', 'error_codes_active'),
      severity: critical ? 'critical' : 'warning',
      title,
    };
  }
  if (reason.category === 'health') {
    return {
      domain: 'vehicle_health',
      issueType: 'health_review_required',
      semanticKey: createVehicleIssueKey(vehicleId, 'vehicle_health', 'review_required'),
      severity: reason.severity === 'critical' ? 'critical' : 'attention',
      title: title || 'Health pruefen',
    };
  }
  if (reason.category === 'telemetry') {
    const offline = text.includes('offline') && !text.includes('soft');
    const softOffline = text.includes('soft') || text.includes('verzoegert') || text.includes('delayed');
    const issueType = offline ? 'telemetry_offline' : softOffline ? 'telemetry_soft_offline' : 'telemetry_unknown';
    return {
      domain: 'telemetry',
      issueType,
      semanticKey: createVehicleIssueKey(vehicleId, 'telemetry', issueType.replace('telemetry_', '')),
      severity: offline ? 'critical' : softOffline ? 'attention' : 'info',
      title: title || (offline ? 'Offline' : softOffline ? 'Soft Offline' : 'Telemetrie unbekannt'),
    };
  }
  if (reason.category === 'cleaning') {
    return {
      domain: 'handover',
      issueType: 'cleaning_required',
      semanticKey: createVehicleIssueKey(vehicleId, 'handover', 'cleaning_required'),
      severity: 'warning',
      title,
    };
  }
  if (reason.category === 'rental') {
    return {
      domain: 'rental_readiness',
      issueType: reason.blocking ? 'rental_blocked' : 'available_not_ready',
      semanticKey: createVehicleIssueKey(vehicleId, 'rental_readiness', reason.blocking ? 'blocked' : 'not_ready'),
      severity: reason.blocking ? 'critical' : 'warning',
      title,
    };
  }
  if (reason.category === 'damage') {
    return {
      domain: 'damage',
      issueType: 'damage_suspicion',
      semanticKey: createVehicleIssueKey(vehicleId, 'damage', 'suspicion'),
      severity: critical ? 'critical' : 'warning',
      title,
    };
  }
  return null;
}

function dashboardInsightToIssueDrafts(
  insight: DashboardInsightLike,
  vehiclesById: Map<string, OperationalIssueVehicleLike>,
): OperationalIssueDraft[] {
  const ids = insight.entityIds?.filter(Boolean) ?? readEntityIdsFromMetrics(insight.metrics);
  if (ids.length === 0) return [];
  const result: OperationalIssueDraft[] = [];
  for (const id of ids) {
    const draft = dashboardInsightToIssueDraft(insight, id, vehiclesById);
    if (draft) result.push(draft);
  }
  return result;
}

function dashboardInsightToIssueDraft(
  insight: DashboardInsightLike,
  entityId: string,
  vehiclesById: Map<string, OperationalIssueVehicleLike>,
): OperationalIssueDraft | null {
  const source: OperationalIssueSource = {
    sourceType: 'dashboard_insight',
    sourceId: insight.id,
    rawType: insight.type,
    debugLabel: `dashboard-insight:${insight.type}`,
  };
  const vehicle = vehiclesById.get(entityId);
  const title = insight.title || insight.message || insight.type;
  const subtitle = insight.message;
  const severity = dashboardSeverity(insight.severity);

  switch (insight.type) {
    case 'SERVICE_OVERDUE':
      return vehicleIssueDraft({
        semanticKey: serviceOverdueKeyForVehicle(entityId),
        domain: 'service_compliance',
        issueType: 'service_overdue',
        severity: 'critical',
        title,
        subtitle,
        vehicleId: entityId,
        vehicle,
        source,
      });
    case 'SERVICE_WINDOW':
      return vehicleIssueDraft({
        semanticKey: `vehicle:${entityId}:service_window:available`,
        domain: 'service_compliance',
        issueType: 'service_window_available',
        severity: 'attention',
        title,
        subtitle,
        vehicleId: entityId,
        vehicle,
        source,
      });
    case 'BATTERY_CRITICAL':
      return vehicleIssueDraft({
        semanticKey: createVehicleIssueKey(entityId, 'vehicle_health', 'battery_critical'),
        domain: 'vehicle_health',
        issueType: 'battery_critical',
        severity: 'critical',
        title,
        subtitle,
        vehicleId: entityId,
        vehicle,
        source,
      });
    case 'TIRE_CRITICAL':
      return vehicleIssueDraft({
        semanticKey: createVehicleIssueKey(entityId, 'vehicle_health', 'tires_critical'),
        domain: 'vehicle_health',
        issueType: 'tire_critical',
        severity: 'critical',
        title,
        subtitle,
        vehicleId: entityId,
        vehicle,
        source,
      });
    case 'BRAKE_CRITICAL':
      return vehicleIssueDraft({
        semanticKey: createVehicleIssueKey(entityId, 'vehicle_health', 'brakes_critical'),
        domain: 'vehicle_health',
        issueType: 'brake_critical',
        severity: 'critical',
        title,
        subtitle,
        vehicleId: entityId,
        vehicle,
        source,
      });
    case 'DRIVING_ASSESSMENT_DEVICE_QUALITY': {
      const recovering =
        typeof insight.metrics?.vehicleStatus === 'string' &&
        insight.metrics.vehicleStatus === 'RECOVERING';
      return vehicleIssueDraft({
        semanticKey: createVehicleIssueKey(
          entityId,
          'vehicle_health',
          'driving_assessment_device_quality',
        ),
        domain: 'vehicle_health',
        issueType: 'driving_assessment_device_quality',
        severity: recovering ? 'attention' : 'warning',
        title,
        subtitle,
        vehicleId: entityId,
        vehicle,
        source,
        visibility: {
          dashboardAttention: true,
          dashboardDrawer: true,
          fleetCommand: true,
          vehicleOverview: true,
          vehicleHealth: false,
          vehicleTrips: true,
          vehicleDamages: false,
          bookingDetail: false,
          finance: false,
          debug: false,
        },
      });
    }
    case 'PICKUP_OVERDUE':
      return {
        semanticKey: createBookingIssueKey(entityId, 'booking', 'pickup_overdue'),
        domain: 'booking',
        issueType: 'pickup_overdue',
        severity: 'critical',
        title,
        subtitle,
        bookingId: entityId,
        source,
      };
    case 'RETURN_OVERDUE':
    case 'RETURN_NEEDS_INSPECTION':
      return {
        semanticKey: createBookingIssueKey(entityId, 'return', insight.type === 'RETURN_OVERDUE' ? 'overdue' : 'inspection_required'),
        domain: 'return',
        issueType: insight.type === 'RETURN_OVERDUE' ? 'return_overdue' : 'return_inspection_required',
        severity: insight.type === 'RETURN_OVERDUE' ? 'critical' : severity,
        title,
        subtitle,
        bookingId: entityId,
        source,
      };
    default:
      return null;
  }
}

function vehicleHealthAlertToIssueDrafts(
  alert: VehicleHealthAlertLike,
  vehiclesById: Map<string, OperationalIssueVehicleLike>,
): OperationalIssueDraft[] {
  const vehicle = vehiclesById.get(alert.vehicleId) ?? alert.vehicle ?? alert;
  const modules = alert.modules ?? [];
  if (modules.length === 0) {
    return [vehicleIssueDraft({
      semanticKey: createVehicleIssueKey(alert.vehicleId, 'vehicle_health', 'review_required'),
      domain: 'vehicle_health',
      issueType: 'health_review_required',
      severity: healthAlertSeverity(alert.severity),
      title: alert.primaryReason || 'Health pruefen',
      subtitle: alert.secondaryReasons?.slice(0, 2).join(' · '),
      vehicleId: alert.vehicleId,
      vehicle,
      source: {
        sourceType: 'rental_health',
        sourceId: `health-alert:${alert.vehicleId}`,
        rawType: 'overview',
        debugLabel: 'vehicle-health-alert',
      },
    })];
  }

  return modules
    .map((module) => healthModuleToIssueDraft(alert, module, vehicle))
    .filter((draft): draft is OperationalIssueDraft => Boolean(draft));
}

function healthModuleToIssueDraft(
  alert: VehicleHealthAlertLike,
  module: VehicleHealthAlertModuleLike,
  vehicle: OperationalIssueVehicleLike,
): OperationalIssueDraft | null {
  const vehicleId = alert.vehicleId;
  const critical = module.severity === 'critical';
  const warning = module.severity === 'warning' || critical;
  if (!warning) return null;

  const source: OperationalIssueSource = {
    sourceType: 'rental_health',
    sourceId: `health-alert:${vehicleId}:${module.module}`,
    rawType: module.module,
    debugLabel: `rental-health:${module.module}`,
  };

  if (module.module === 'service_compliance') {
    const text = `${module.reason ?? ''} ${module.label ?? ''}`.toLowerCase();
    if (isHmOemServiceTrackingMissingText(text) && !isOverdueText(text)) {
      return vehicleIssueDraft({
        semanticKey: createVehicleIssueKey(vehicleId, 'data_quality', 'hm_oem_service_tracking_missing'),
        domain: 'data_quality',
        issueType: 'hm_oem_service_tracking_missing',
        severity: 'info',
        title: module.reason || 'Service-Tracking nicht verfuegbar',
        subtitle: module.dataStale ? 'Datenstand verzoegert' : undefined,
        vehicleId,
        vehicle,
        source,
      });
    }
    const overdue = critical || isOverdueText(text);
    return vehicleIssueDraft({
      semanticKey: createVehicleIssueKey(vehicleId, 'service_compliance', overdue ? 'overdue' : 'due_soon'),
      domain: 'service_compliance',
      issueType: overdue ? 'service_overdue' : 'service_due_soon',
      severity: overdue ? 'critical' : 'warning',
      title: module.reason || (overdue ? 'Service ueberfaellig' : 'Service bald faellig'),
      subtitle: module.dataStale ? 'Datenstand verzoegert' : undefined,
      vehicleId,
      vehicle,
      source,
    });
  }

  const mapped = healthModuleIssue(module, critical);
  if (!mapped) return null;
  return vehicleIssueDraft({
    semanticKey: createVehicleIssueKey(vehicleId, 'vehicle_health', mapped.keyType),
    domain: 'vehicle_health',
    issueType: mapped.issueType,
    severity: mapped.severity,
    title: module.reason || mapped.title,
    subtitle: module.dataStale ? 'Datenstand verzoegert' : undefined,
    vehicleId,
    vehicle,
    source,
  });
}

function healthModuleIssue(
  module: VehicleHealthAlertModuleLike,
  critical: boolean,
): { issueType: string; keyType: string; severity: OperationalIssueSeverity; title: string } | null {
  switch (module.module) {
    case 'battery':
      return {
        issueType: critical ? 'battery_critical' : 'battery_warning',
        keyType: critical ? 'battery_critical' : 'battery_warning',
        severity: critical ? 'critical' : 'warning',
        title: critical ? 'Batterie kritisch' : 'Batterie pruefen',
      };
    case 'tires': {
      const mapped = mapTireOperationalIssue({
        moduleState: critical ? 'critical' : module.severity ?? 'warning',
        title: module.reason ?? module.label,
        reason: module.reason ?? module.label,
      });
      if (!mapped) return null;
      return {
        issueType: mapped.issueType,
        keyType: mapped.keyType,
        severity: mapped.severity,
        title: critical ? 'Reifen kritisch' : module.reason || 'Reifen beobachten',
      };
    }
    case 'brakes':
      return {
        issueType: critical ? 'brake_critical' : 'brake_warning',
        keyType: critical ? 'brakes_critical' : 'brakes_warning',
        severity: critical ? 'critical' : 'warning',
        title: critical ? 'Bremsen kritisch' : 'Bremsen pruefen',
      };
    case 'error_codes':
      return {
        issueType: 'error_codes_active',
        keyType: 'error_codes_active',
        severity: critical ? 'critical' : 'warning',
        title: 'Fehlercodes pruefen',
      };
    case 'vehicle_alerts':
      return {
        issueType: 'warning_light_active',
        keyType: 'warning_light_active',
        severity: critical ? 'critical' : 'warning',
        title: 'Warnleuchte aktiv',
      };
    default:
      return {
        issueType: 'health_review_required',
        keyType: 'review_required',
        severity: critical ? 'critical' : 'attention',
        title: module.reason || module.label || 'Health pruefen',
      };
  }
}

function predictiveInsightToIssueDraft(
  insight: PredictiveInsightLike,
  vehiclesById: Map<string, OperationalIssueVehicleLike>,
): OperationalIssueDraft | null {
  const vehicleId = insight.vehicleId ?? insight.affectedEntity?.vehicleId;
  const bookingId = insight.bookingId ?? insight.affectedEntity?.bookingId;
  const stationId = insight.stationId ?? insight.affectedEntity?.stationId;
  const source: OperationalIssueSource = {
    sourceType: 'predictive_insight',
    sourceId: insight.id,
    rawType: insight.type,
    debugLabel: 'predictive-operations',
  };

  if (insight.type === 'SERVICE_WINDOW' && vehicleId) {
    return vehicleIssueDraft({
      semanticKey: `vehicle:${vehicleId}:service_window:available`,
      domain: 'service_compliance',
      issueType: 'service_window_available',
      severity: 'attention',
      title: insight.title || 'Servicefenster verfuegbar',
      subtitle: insight.explanation,
      vehicleId,
      vehicle: vehiclesById.get(vehicleId),
      source,
      evidence: insight.sourceData ? [{ label: 'Kontext', value: insight.sourceData, source: 'predictive-operations' }] : undefined,
      recommendedAction: insight.recommendedAction,
    });
  }
  if (insight.type === 'SOFT_OFFLINE_TELEMETRY_CHECK' && vehicleId) {
    return vehicleIssueDraft({
      semanticKey: createVehicleIssueKey(vehicleId, 'telemetry', 'soft_offline'),
      domain: 'telemetry',
      issueType: 'telemetry_soft_offline',
      severity: 'attention',
      title: insight.title || 'Soft Offline',
      subtitle: insight.explanation,
      vehicleId,
      vehicle: vehiclesById.get(vehicleId),
      source,
      recommendedAction: insight.recommendedAction,
    });
  }
  if (insight.type === 'RETURN_OVERDUE_THREATENS_FOLLOWUP' && bookingId) {
    return {
      semanticKey: createBookingIssueKey(bookingId, 'return', 'overdue'),
      domain: 'return',
      issueType: 'return_overdue',
      severity: 'critical',
      title: insight.title || 'Rueckgabe ueberfaellig',
      subtitle: insight.explanation,
      bookingId,
      source,
      recommendedAction: insight.recommendedAction,
    };
  }
  if (insight.type === 'STATION_SHORTAGE_24H' && stationId) {
    return {
      semanticKey: `station:${stationId}:station_operations:shortage`,
      domain: 'station_operations',
      issueType: 'station_shortage',
      severity: predictiveSeverity(insight.severity),
      title: insight.title || 'Station ausgelastet',
      subtitle: insight.explanation,
      stationId,
      source,
      recommendedAction: insight.recommendedAction,
    };
  }
  return null;
}

function misuseCaseToIssueDraft(misuseCase: MisuseCaseLike): OperationalIssueDraft | null {
  const mapped = misuseCaseTypeMapping(misuseCaseType(misuseCase));
  if (!mapped) return null;
  const tripId = misuseCase.tripId ?? undefined;
  const vehicleId = misuseCase.vehicleId ?? undefined;
  const semanticKey = tripId
    ? createTripIssueKey(tripId, mapped.domain, mapped.keyType)
    : vehicleId
      ? createVehicleIssueKey(vehicleId, mapped.domain, mapped.keyType)
      : `${mapped.domain}:${mapped.issueType}:${misuseCase.id}`;
  return {
    semanticKey,
    domain: mapped.domain,
    issueType: mapped.issueType,
    severity: mapped.severity,
    title: mapped.title,
    subtitle: sanitizeUserFacingIssueText(misuseCase.description) || mapped.subtitle,
    vehicleId,
    tripId,
    bookingId: misuseCase.bookingId ?? undefined,
    customerId: misuseCase.customerId ?? undefined,
    source: {
      sourceType: mapped.domain === 'damage' ? 'damage_case' : 'misuse_case',
      sourceId: misuseCase.id,
      rawType: misuseCase.type,
      debugLabel: 'misuse-case',
    },
    evidence: evidenceFromMisuseCase(misuseCase),
    recommendedAction: sanitizeUserFacingIssueText(misuseCase.recommendedAction),
  };
}

function misuseCaseType(misuseCase: MisuseCaseLike): string {
  return String(misuseCase.type ?? '').toUpperCase();
}

function misuseCaseTypeMapping(type: string): {
  domain: 'misuse' | 'damage';
  issueType: string;
  keyType: string;
  severity: OperationalIssueSeverity;
  title: string;
  subtitle: string;
} | null {
  if (type.includes('COLD_ENGINE')) {
    return {
      domain: 'misuse',
      issueType: 'cold_engine_abuse',
      keyType: 'cold_engine_abuse',
      severity: 'warning',
      title: 'Kaltmotor-Missbrauch erkannt',
      subtitle: 'Hohe Last bei kaltem Motor erkannt.',
    };
  }
  if (type.includes('ACCEL')) {
    return {
      domain: 'misuse',
      issueType: 'harsh_acceleration',
      keyType: 'harsh_acceleration',
      severity: 'attention',
      title: 'Starke Beschleunigung erkannt',
      subtitle: 'Auffällige Beschleunigung während der Fahrt erkannt.',
    };
  }
  if (type.includes('BRAKE')) {
    return {
      domain: 'misuse',
      issueType: 'harsh_braking',
      keyType: 'harsh_braking',
      severity: 'attention',
      title: 'Starke Bremsung erkannt',
      subtitle: 'Auffälliges Bremsereignis während der Fahrt erkannt.',
    };
  }
  if (type.includes('IMPACT') || type.includes('COLLISION')) {
    return {
      domain: 'damage',
      issueType: 'impact_suspicion',
      keyType: 'impact_suspicion',
      severity: 'warning',
      title: 'Impact-Verdacht',
      subtitle: 'Möglicher Aufprall oder Schadenbezug erkannt.',
    };
  }
  if (type.includes('DAMAGE') || type.includes('DTC_AFTER') || type.includes('OVERHEATING')) {
    return {
      domain: 'damage',
      issueType: 'damage_suspicion',
      keyType: 'suspicion',
      severity: 'warning',
      title: 'Schadensverdacht',
      subtitle: 'Technischer Schadenbezug prüfen.',
    };
  }
  if (type) {
    return {
      domain: 'misuse',
      issueType: 'suspicious_trip',
      keyType: 'suspicious_trip',
      severity: 'attention',
      title: 'Auffällige Fahrt',
      subtitle: 'Auffälligkeit im Fahrtkontext erkannt.',
    };
  }
  return null;
}

function evidenceFromMisuseCase(misuseCase: MisuseCaseLike): OperationalIssueEvidence[] | undefined {
  const evidence: OperationalIssueEvidence[] = [];
  const summary = misuseCase.evidenceSummary ?? {};
  pushEvidenceNumber(evidence, summary, ['engineRpm', 'maxEngineRpm', 'rpm'], 'Drehzahl', 'rpm');
  pushEvidenceNumber(evidence, summary, ['throttlePosition', 'maxThrottlePos', 'throttle'], 'Gaspedal', '%');
  pushEvidenceNumber(evidence, summary, ['coolantTemperatureC', 'maxCoolantTemp', 'coolantC'], 'Kühlmittel', '°C');
  pushEvidenceNumber(evidence, summary, ['speedKmh', 'maxSpeedKmh', 'startSpeedKmh'], 'Geschwindigkeit', 'km/h');
  pushEvidenceNumber(evidence, summary, ['durationSeconds', 'durationSec'], 'Dauer', 's');
  const durationMs = readNumber(summary, ['durationMs']);
  if (durationMs != null && durationMs > 0) {
    evidence.push({ label: 'Dauer', value: String(Math.max(1, Math.round(durationMs / 1000))), unit: 's' });
  }
  if (misuseCase.eventCount != null && misuseCase.eventCount > 0) {
    evidence.push({
      label: 'Ereignisse',
      value: `${misuseCase.eventCount} ${misuseCase.eventCount === 1 ? 'Ereignis' : 'Ereignisse'}`,
    });
  }
  if (misuseCase.firstDetectedAt) {
    evidence.push({ label: 'Zeitpunkt', value: misuseCase.firstDetectedAt });
  }
  const hf = summary.highFrequencyAvailable;
  if (typeof hf === 'boolean') {
    evidence.push({ label: 'HF-Daten', value: hf ? 'verfügbar' : 'nicht verfügbar' });
  }
  return mergeEvidence(evidence);
}

function pushEvidenceNumber(
  target: OperationalIssueEvidence[],
  source: Record<string, unknown>,
  keys: string[],
  label: string,
  unit: string,
): void {
  const value = readNumber(source, keys);
  if (value == null) return;
  target.push({ label, value: String(Math.round(value)), unit });
}

function readNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function mergeDrafts(
  drafts: OperationalIssueDraft[],
  options: OperationalIssueNormalizerOptions,
): OperationalIssue[] {
  const byKey = new Map<string, OperationalIssueDraft[]>();
  for (const draft of drafts) {
    const list = byKey.get(draft.semanticKey) ?? [];
    list.push(draft);
    byKey.set(draft.semanticKey, list);
  }

  mergeServiceWindowIntoOverdue(byKey);

  return Array.from(byKey.values())
    .map((group) => mergeIssueGroup(group))
    .map((issue) => finalizeIssue(issue, options))
    .filter((issue) => !isSuppressedServiceWindow(issue, byKey))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.semanticKey.localeCompare(b.semanticKey));
}

function suppressGenericHealthFallbacks(drafts: OperationalIssueDraft[]): OperationalIssueDraft[] {
  const vehiclesWithConcreteHealth = new Set(
    drafts
      .filter(
        (draft) =>
          draft.vehicleId &&
          draft.domain === 'vehicle_health' &&
          draft.issueType !== 'health_review_required',
      )
      .map((draft) => draft.vehicleId as string),
  );
  return drafts.filter(
    (draft) =>
      !(
        draft.vehicleId &&
        draft.domain === 'vehicle_health' &&
        draft.issueType === 'health_review_required' &&
        vehiclesWithConcreteHealth.has(draft.vehicleId)
      ),
  );
}

function suppressHealthWhenServiceOverdue(drafts: OperationalIssueDraft[]): OperationalIssueDraft[] {
  const vehiclesWithServiceOverdue = new Set(
    drafts
      .filter((draft) => draft.vehicleId && draft.issueType === 'service_overdue')
      .map((draft) => draft.vehicleId as string),
  );
  return drafts.filter((draft) => {
    if (!draft.vehicleId || !vehiclesWithServiceOverdue.has(draft.vehicleId)) return true;
    if (draft.domain === 'vehicle_health' && draft.issueType === 'health_review_required') return false;
    if (
      draft.domain === 'vehicle_health'
      && draft.issueType !== 'service_overdue'
      && isOverdueText(`${draft.title} ${draft.subtitle ?? ''}`.toLowerCase())
      && !['battery', 'tires', 'brakes', 'error_codes', 'vehicle_alerts'].some((module) =>
        `${draft.source.rawType ?? ''} ${draft.source.debugLabel ?? ''}`.includes(module),
      )
    ) {
      return false;
    }
    return true;
  });
}

function mergeServiceWindowIntoOverdue(byKey: Map<string, OperationalIssueDraft[]>): void {
  for (const [key, windowDrafts] of Array.from(byKey.entries())) {
    if (!isServiceWindowKey(key)) continue;
    const vehicleId = windowDrafts[0]?.vehicleId;
    if (!vehicleId) continue;
    const overdueKey = serviceOverdueKeyForVehicle(vehicleId);
    const overdueDrafts = byKey.get(overdueKey);
    if (!overdueDrafts?.length) continue;
    overdueDrafts.push(
      ...windowDrafts.map((draft) => ({
        ...draft,
        semanticKey: overdueKey,
        issueType: 'service_overdue',
        title: 'Servicefenster als Kontext verfuegbar',
        severity: 'attention' as OperationalIssueSeverity,
      })),
    );
    byKey.delete(key);
  }
}

function isSuppressedServiceWindow(issue: OperationalIssue, byKey: Map<string, OperationalIssueDraft[]>): boolean {
  if (!isServiceWindowKey(issue.semanticKey) || !issue.vehicleId) return false;
  return byKey.has(serviceOverdueKeyForVehicle(issue.vehicleId));
}

function mergeIssueGroup(group: OperationalIssueDraft[]): OperationalIssue {
  const sources = uniqueSources(group.flatMap((draft) => [draft.source, ...(draft.supportingSources ?? [])]));
  const primarySource = choosePrimaryIssueSource(sources);
  const primaryDraft = choosePrimaryDraft(group, primarySource);
  const severity = highestSeverity(group.map((draft) => draft.severity));
  const supportingSources = mergeIssueSources(primarySource, sources);
  const evidence = mergeEvidence(group.flatMap((draft) => draft.evidence ?? []));
  const visibility = primaryDraft.visibility ?? getDefaultOperationalIssueVisibility(primaryDraft.domain, primaryDraft.issueType);

  return {
    id: primaryDraft.semanticKey,
    semanticKey: primaryDraft.semanticKey,
    domain: primaryDraft.domain,
    issueType: primaryDraft.issueType,
    severity,
    title: primaryDraft.title,
    subtitle: primaryDraft.subtitle,
    entityLabel: primaryDraft.entityLabel,
    vehicleId: primaryDraft.vehicleId,
    bookingId: primaryDraft.bookingId,
    tripId: primaryDraft.tripId,
    customerId: primaryDraft.customerId,
    invoiceId: primaryDraft.invoiceId,
    stationId: primaryDraft.stationId,
    primarySource,
    supportingSources,
    evidence: evidence.length ? evidence : undefined,
    recommendedAction: primaryDraft.recommendedAction,
    cta: primaryDraft.cta,
    visibility,
  };
}

function choosePrimaryDraft(group: OperationalIssueDraft[], primarySource: OperationalIssueSource): OperationalIssueDraft {
  const primaryIdentity = sourceIdentityLite(primarySource);
  return (
    group.find((draft) => sourceIdentityLite(draft.source) === primaryIdentity) ??
    [...group].sort(
      (a, b) =>
        getOperationalIssueSourcePriority(a.source) - getOperationalIssueSourcePriority(b.source) ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    )[0]
  );
}

function finalizeIssue(issue: OperationalIssue, options: OperationalIssueNormalizerOptions): OperationalIssue {
  void options;
  const canonical = applyCanonicalTaxonomyToIssue(issue);
  const title = formatOperationalIssueTitle(canonical);
  const subtitle = formatOperationalIssueSubtitle(canonical);
  return {
    ...canonical,
    title,
    subtitle,
    evidence: canonical.evidence?.map((evidence) => ({
      ...evidence,
      label: sanitizeUserFacingIssueText(evidence.label),
      value: sanitizeUserFacingIssueText(evidence.value),
    })),
  };
}

function vehicleIssueDraft(draft: OperationalIssueDraft & {
  vehicle: OperationalIssueVehicleLike | undefined;
}): OperationalIssueDraft {
  const { vehicle, ...rest } = draft;
  return {
    ...rest,
    entityLabel: rest.entityLabel ?? formatVehicleIssueEntityLabel(vehicle ?? { id: rest.vehicleId }),
  };
}

function sourceFromRuntimeReason(reason: RuntimeReasonLike): OperationalIssueSource {
  const source = reason.source ?? '';
  if (source.startsWith('rental-health:')) {
    return {
      sourceType: 'rental_health',
      sourceId: reason.id,
      rawType: source.replace('rental-health:', ''),
      debugLabel: source,
    };
  }
  if (source.startsWith('dashboard-insight:')) {
    return {
      sourceType: 'dashboard_insight',
      sourceId: reason.id,
      rawType: source.replace('dashboard-insight:', ''),
      debugLabel: source,
    };
  }
  if (source === 'vehicle-runtime') {
    return { sourceType: 'runtime', sourceId: reason.id, debugLabel: source };
  }
  if (source === 'dashboard-health-risk') {
    return { sourceType: 'runtime', sourceId: reason.id, debugLabel: source };
  }
  return { sourceType: 'runtime', sourceId: reason.id, rawType: reason.category, debugLabel: source || undefined };
}

function evidenceFromReason(reason: RuntimeReasonLike): OperationalIssueEvidence[] | undefined {
  const evidence: OperationalIssueEvidence[] = [];
  if (reason.source) evidence.push({ label: 'Quelle', value: reason.source, source: 'debug' });
  if (reason.description && reason.description !== reason.title) {
    evidence.push({ label: 'Hinweis', value: reason.description });
  }
  return evidence.length ? evidence : undefined;
}

function runtimeReasonSeverity(reason: RuntimeReasonLike): OperationalIssueSeverity {
  if (reason.severity === 'critical') return 'critical';
  if (reason.severity === 'warning') return 'warning';
  return 'attention';
}

function dashboardSeverity(severity: DashboardInsightLike['severity']): OperationalIssueSeverity {
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'WARNING') return 'warning';
  if (severity === 'OPPORTUNITY') return 'attention';
  return 'info';
}

function healthAlertSeverity(severity: VehicleHealthAlertLike['severity']): OperationalIssueSeverity {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'attention';
}

function predictiveSeverity(severity: PredictiveInsightLike['severity']): OperationalIssueSeverity {
  if (severity === 'critical' || severity === 'warning' || severity === 'attention' || severity === 'info') return severity;
  return 'attention';
}

function highestSeverity(severities: OperationalIssueSeverity[]): OperationalIssueSeverity {
  return [...severities].sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0] ?? 'info';
}

function mergeEvidence(evidence: OperationalIssueEvidence[]): OperationalIssueEvidence[] {
  const seen = new Set<string>();
  const result: OperationalIssueEvidence[] = [];
  for (const item of evidence) {
    const key = [item.label, item.value, item.unit ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function asVehicleMap(
  vehiclesById: OperationalIssueNormalizationInput['vehiclesById'],
): Map<string, OperationalIssueVehicleLike> {
  if (!vehiclesById) return new Map();
  if (vehiclesById instanceof Map) return vehiclesById;
  return new Map(Object.entries(vehiclesById));
}

function readEntityIdsFromMetrics(metrics: Record<string, unknown> | null | undefined): string[] {
  const entities = metrics?.entities;
  if (!Array.isArray(entities)) return [];
  return entities
    .map((entity) => (typeof entity === 'object' && entity ? (entity as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function isOverdueText(text: string): boolean {
  return (
    text.includes('overdue') ||
    text.includes('ueberfaellig') ||
    text.includes('überfällig') ||
    text.includes('abgelaufen')
  );
}

function sourceIdentityLite(source: OperationalIssueSource): string {
  return [source.sourceType, source.sourceId ?? '', source.rawType ?? '', source.debugLabel ?? ''].join('|');
}
