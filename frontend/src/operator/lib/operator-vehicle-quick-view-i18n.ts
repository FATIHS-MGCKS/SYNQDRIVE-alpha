/**
 * Operator Vehicle Quick View presentation adapter (P2.2.27 QV-G tasks + P2.2.28 header + P2.2.29 quick actions + P2.2.30 tool actions + P2.2.31 booking context + P2.2.32 rental health modules + P2.2.33 active damages + P2.2.34 tire profile + P2.2.35 documents).
 * Machine status/task values stay unchanged; presentation maps to TranslationKey only.
 */
import type {
  ApiTaskPriority,
  ApiTaskStatus,
  RentalHealthModule,
  RentalHealthState,
  TireHealthSummaryResponse,
  VehicleHealthResponse,
} from '../../lib/api';
import {
  tireLowestTreadLabel,
  tireRemainingKmLabel,
  tireUiStatusLabel,
  type TireUiLocale,
} from '../../rental/lib/tire-health-detail-ui';
import type { DamageRentalImpact, DamageResponse } from '../../rental/lib/damage.types';
import {
  operatorDamageCaptureDamageTypeLabel,
  operatorDamageCaptureRentalImpactLabel,
  operatorDamageCaptureSeverityLabel,
} from './operator-damage-capture-i18n';
import type { StatusTone } from '../../components/patterns';
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  serviceTaskPriorityLabel,
  serviceTaskStatusLabel,
} from '../../lib/tasks/service-task-presentation-i18n';
import type { VehicleOperationalDisplayLocale } from '../../rental/lib/vehicle-operational-state';
import { operatorFormattingLocale } from '../handover/operator-handover-i18n';
import type {
  OperatorPrimaryStatus,
  OperatorReleaseDecision,
} from './operatorVehicleQuickView.utils';
import { moduleTone } from './operatorVehicleQuickView.utils';

export type OperatorVehicleQuickViewBookingKind = 'pickup' | 'return' | 'active' | 'reserved';

const BOOKING_KIND_KEYS: Record<OperatorVehicleQuickViewBookingKind, TranslationKey> = {
  pickup: 'operator.vehicleQuickView.booking.kind.pickup',
  return: 'operator.vehicleQuickView.booking.kind.return',
  active: 'operator.vehicleQuickView.booking.kind.active',
  reserved: 'operator.vehicleQuickView.booking.kind.reserved',
};

export function resolveOperatorVehicleQuickViewLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function resolveOperatorVehicleQuickViewOperationalDisplayLocale(
  locale: string | null | undefined,
): VehicleOperationalDisplayLocale {
  return resolveOperatorVehicleQuickViewLocale(locale) === 'de' ? 'de' : 'en';
}

export function ovqt(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorVehicleQuickViewLocale(locale), key, vars).text;
}

const PRIMARY_STATUS_KEYS: Record<OperatorPrimaryStatus, TranslationKey> = {
  ready: 'dashboard.label.ready',
  blocked: 'dashboard.label.blocked',
  rented: 'operator.vehicleQuickView.header.primaryStatus.rented',
  in_service: 'operator.vehicleQuickView.header.primaryStatus.inService',
  out_of_service: 'operator.vehicleQuickView.header.primaryStatus.outOfService',
  review_required: 'operator.vehicleQuickView.header.primaryStatus.reviewRequired',
};

const RELEASE_DECISION_KEYS: Record<OperatorReleaseDecision, TranslationKey> = {
  yes: 'operator.vehicleQuickView.header.release.yes',
  no: 'operator.vehicleQuickView.header.release.no',
  review: 'operator.vehicleQuickView.header.release.review',
  unavailable: 'operator.vehicleQuickView.header.release.unavailable',
};

const RENTAL_HEALTH_STATE_KEYS: Record<RentalHealthState, TranslationKey> = {
  good: 'health.state.good',
  warning: 'health.state.warning',
  critical: 'health.state.critical',
  unknown: 'health.state.unknown',
  n_a: 'health.state.na',
};

export function operatorVehicleQuickViewHeaderNotFound(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.header.notFound');
}

export function operatorVehicleQuickViewHeaderCloseAriaLabel(locale: string): string {
  return ovqt(locale, 'common.close');
}

export function operatorVehicleQuickViewHeaderCleaningPendingLabel(locale: string): string {
  return ovqt(locale, 'dashboard.fleet.cleaningPending');
}

export function operatorVehicleQuickViewHeaderReleaseQuestion(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.header.releaseQuestion');
}

export function operatorVehicleQuickViewHeaderRentalHealthPrefix(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.header.rentalHealthPrefix');
}

export function operatorVehicleQuickViewPrimaryStatusLabel(
  locale: string,
  status: OperatorPrimaryStatus,
): string {
  return ovqt(locale, PRIMARY_STATUS_KEYS[status]);
}

export function operatorVehicleQuickViewReleaseLabel(
  locale: string,
  decision: OperatorReleaseDecision,
): string {
  return ovqt(locale, RELEASE_DECISION_KEYS[decision]);
}

export function operatorVehicleQuickViewRentalHealthStateLabel(
  locale: string,
  state: RentalHealthState,
): string {
  return ovqt(locale, RENTAL_HEALTH_STATE_KEYS[state]);
}

export function operatorVehicleQuickViewTasksSectionTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.sectionTitle');
}

export function operatorVehicleQuickViewTasksNewLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.new');
}

export function operatorVehicleQuickViewTasksEmptyLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.empty');
}

export function operatorVehicleQuickViewTaskOpenAriaLabel(
  locale: string,
  title: string,
): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.openTaskAria', { title });
}

export function operatorVehicleQuickViewTaskStatusLabel(
  locale: string,
  status: ApiTaskStatus,
  isOverdue: boolean,
): string {
  if (isOverdue) {
    return ovqt(locale, 'status.overdue');
  }
  return serviceTaskStatusLabel(locale, status);
}

export function operatorVehicleQuickViewTaskPriorityLabel(
  locale: string,
  priority: ApiTaskPriority,
): string {
  return serviceTaskPriorityLabel(locale, priority);
}

export function operatorVehicleQuickViewQuickActionPickupLabel(locale: string): string {
  return ovqt(locale, 'vehicle.bookings.startPickup');
}

export function operatorVehicleQuickViewQuickActionReturnLabel(locale: string): string {
  return ovqt(locale, 'vehicle.bookings.startReturn');
}

export function operatorVehicleQuickViewQuickActionCreateBookingLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.quickActions.createBooking.title');
}

export function operatorVehicleQuickViewToolActionDamageCaptureTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.damageCapture.title');
}

export function operatorVehicleQuickViewToolActionDamageCaptureSubtitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.damageCapture.subtitle');
}

export function operatorVehicleQuickViewToolActionAiUploadTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.aiUpload.title');
}

export function operatorVehicleQuickViewToolActionAiUploadSubtitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.aiUpload.subtitle');
}

export function operatorVehicleQuickViewToolActionTireMeasureTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.tireMeasure.title');
}

export function operatorVehicleQuickViewToolActionTireMeasureSubtitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.tireMeasure.subtitle');
}

export function operatorVehicleQuickViewToolActionTaskCreateTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.taskCreate.title');
}

export function operatorVehicleQuickViewToolActionTaskCreateSubtitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.toolActions.taskCreate.subtitle');
}

export function operatorVehicleQuickViewBookingSectionTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.booking.sectionTitle');
}

export function operatorVehicleQuickViewBookingKindLabel(
  locale: string,
  kind: OperatorVehicleQuickViewBookingKind,
): string {
  return ovqt(locale, BOOKING_KIND_KEYS[kind]);
}

export function operatorVehicleQuickViewBookingContextAriaLabel(
  locale: string,
  kind: OperatorVehicleQuickViewBookingKind,
): string {
  return ovqt(locale, 'operator.vehicleQuickView.booking.contextAria', {
    kind: operatorVehicleQuickViewBookingKindLabel(locale, kind),
  });
}

export function formatOperatorVehicleQuickViewDateTime(
  locale: string,
  iso: string | null | undefined,
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(operatorFormattingLocale(locale), {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export type OperatorVehicleQuickViewRentalHealthModuleKey =
  keyof VehicleHealthResponse['modules'];

export const RENTAL_HEALTH_MODULE_KEYS = [
  'battery',
  'tires',
  'brakes',
  'error_codes',
  'service_compliance',
  'complaints',
  'vehicle_alerts',
] as const satisfies readonly OperatorVehicleQuickViewRentalHealthModuleKey[];

const RENTAL_HEALTH_MODULE_KEYS_MAP: Record<
  OperatorVehicleQuickViewRentalHealthModuleKey,
  TranslationKey
> = {
  battery: 'operator.vehicleQuickView.health.module.battery',
  tires: 'operator.vehicleQuickView.health.module.tires',
  brakes: 'operator.vehicleQuickView.health.module.brakes',
  error_codes: 'operator.vehicleQuickView.health.module.error_codes',
  service_compliance: 'operator.vehicleQuickView.health.module.service_compliance',
  complaints: 'operator.vehicleQuickView.health.module.complaints',
  vehicle_alerts: 'operator.vehicleQuickView.health.module.vehicle_alerts',
};

export function operatorVehicleQuickViewRentalHealthSectionTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.health.sectionTitle');
}

export function operatorVehicleQuickViewRentalHealthEmptyLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.health.empty');
}

export function operatorVehicleQuickViewRentalHealthNoDataLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.health.noData');
}

export function operatorVehicleQuickViewRentalHealthReasonFallback(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.health.reasonFallback');
}

export function operatorVehicleQuickViewRentalHealthStaleSuffix(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.health.staleSuffix');
}

export function operatorVehicleQuickViewRentalHealthModuleLabel(
  locale: string,
  moduleKey: OperatorVehicleQuickViewRentalHealthModuleKey,
): string {
  return ovqt(locale, RENTAL_HEALTH_MODULE_KEYS_MAP[moduleKey]);
}

export function operatorVehicleQuickViewRentalHealthModulePresentation(
  locale: string,
  module: RentalHealthModule | undefined,
): {
  stateLabel: string;
  reason: string;
  tone: StatusTone;
  stale: boolean;
} {
  if (!module) {
    return {
      stateLabel: operatorVehicleQuickViewRentalHealthReasonFallback(locale),
      reason: operatorVehicleQuickViewRentalHealthNoDataLabel(locale),
      tone: 'neutral',
      stale: false,
    };
  }

  return {
    stateLabel: operatorVehicleQuickViewRentalHealthStateLabel(locale, module.state),
    reason: module.reason || operatorVehicleQuickViewRentalHealthReasonFallback(locale),
    tone: moduleTone(module.state),
    stale: module.data_stale,
  };
}

export function operatorVehicleQuickViewActiveDamagesSectionTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.damages.sectionTitle');
}

export function operatorVehicleQuickViewActiveDamagesEmptyLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.damages.empty');
}

export function operatorVehicleQuickViewActiveDamagesRowSeparator(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.damages.rowSeparator');
}

export function operatorVehicleQuickViewActiveDamagesTypeLabel(
  locale: string,
  damageType: string,
): string {
  return operatorDamageCaptureDamageTypeLabel(locale, damageType);
}

export function operatorVehicleQuickViewActiveDamagesSeverityLabel(
  locale: string,
  severity: DamageResponse['severity'],
): string {
  return operatorDamageCaptureSeverityLabel(locale, severity);
}

export function operatorVehicleQuickViewActiveDamagesImpactLabel(
  locale: string,
  rentalImpact: DamageRentalImpact,
): string {
  return operatorDamageCaptureRentalImpactLabel(locale, rentalImpact);
}

export function operatorVehicleQuickViewActiveDamagesRowTitle(
  locale: string,
  damage: Pick<DamageResponse, 'damageType' | 'severity'>,
): string {
  return [
    operatorVehicleQuickViewActiveDamagesTypeLabel(locale, damage.damageType),
    operatorVehicleQuickViewActiveDamagesSeverityLabel(locale, damage.severity),
  ].join(operatorVehicleQuickViewActiveDamagesRowSeparator(locale));
}

const TIRE_DISPLAY_MODE_KEYS = {
  MEASURED: 'operator.vehicleQuickView.tire.displayMode.MEASURED',
  ESTIMATED: 'operator.vehicleQuickView.tire.displayMode.ESTIMATED',
  UNKNOWN: 'operator.vehicleQuickView.tire.displayMode.UNKNOWN',
} as const satisfies Record<string, TranslationKey>;

const TIRE_MEASUREMENT_STATE_KEYS = {
  measured: 'operator.vehicleQuickView.tire.measurementState.measured',
  estimated: 'operator.vehicleQuickView.tire.measurementState.estimated',
  mixed: 'operator.vehicleQuickView.tire.measurementState.mixed',
} as const satisfies Record<string, TranslationKey>;

function operatorVehicleQuickViewTireUiLocale(locale: string): TireUiLocale {
  return resolveOperatorVehicleQuickViewOperationalDisplayLocale(locale);
}

export function operatorVehicleQuickViewTireProfileSectionTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tire.sectionTitle');
}

export function operatorVehicleQuickViewTireProfileMeasureActionLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tire.measureAction');
}

export function operatorVehicleQuickViewTireProfileEmptyLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tire.empty');
}

export function operatorVehicleQuickViewTireProfileLabel(
  locale: string,
  field:
    | 'lastMeasurement'
    | 'minTread'
    | 'status'
    | 'remaining'
    | 'mode',
): string {
  return ovqt(locale, `operator.vehicleQuickView.tire.label.${field}`);
}

export function operatorVehicleQuickViewTireProfileLastMeasurementLabel(
  locale: string,
  tireSummary: TireHealthSummaryResponse,
): string {
  return formatOperatorVehicleQuickViewDateTime(
    locale,
    tireSummary.lastMeasurementAt ?? tireSummary.latestMeasurementAt,
  );
}

export function operatorVehicleQuickViewTireProfileMinTreadLabel(
  locale: string,
  tireSummary: TireHealthSummaryResponse,
): string {
  return tireLowestTreadLabel(tireSummary, operatorVehicleQuickViewTireUiLocale(locale));
}

export function operatorVehicleQuickViewTireProfileStatusLabel(
  locale: string,
  tireSummary: TireHealthSummaryResponse,
): string {
  return tireUiStatusLabel(tireSummary, operatorVehicleQuickViewTireUiLocale(locale));
}

export function operatorVehicleQuickViewTireProfileRemainingLabel(
  locale: string,
  tireSummary: TireHealthSummaryResponse,
): string {
  return tireRemainingKmLabel(tireSummary, operatorVehicleQuickViewTireUiLocale(locale));
}

export function operatorVehicleQuickViewTireProfileModeLabel(
  locale: string,
  tireSummary: TireHealthSummaryResponse,
): string {
  const displayMode = tireSummary.displayMode;
  if (displayMode && displayMode in TIRE_DISPLAY_MODE_KEYS) {
    return ovqt(locale, TIRE_DISPLAY_MODE_KEYS[displayMode as keyof typeof TIRE_DISPLAY_MODE_KEYS]);
  }

  const measurementState = tireSummary.measurementState;
  if (measurementState && measurementState in TIRE_MEASUREMENT_STATE_KEYS) {
    return ovqt(
      locale,
      TIRE_MEASUREMENT_STATE_KEYS[measurementState as keyof typeof TIRE_MEASUREMENT_STATE_KEYS],
    );
  }

  return '—';
}

export interface OperatorVehicleQuickViewDocumentPresentationRow {
  documentType: string;
  status: string;
  sourceFileName: string | null;
  createdAt: string;
}

function operatorVehicleQuickViewCanonicalEnumLabel(
  locale: string,
  key: TranslationKey,
  machineValue: string,
): string {
  const result = translateKey(resolveOperatorVehicleQuickViewLocale(locale), key);
  if (result.source === 'missing-key') {
    return machineValue;
  }
  return result.text;
}

export function operatorVehicleQuickViewDocumentsSectionTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.documents.sectionTitle');
}

export function operatorVehicleQuickViewDocumentTypeLabel(
  locale: string,
  documentType: string,
): string {
  return operatorVehicleQuickViewCanonicalEnumLabel(
    locale,
    `documentExtraction.type.${documentType}` as TranslationKey,
    documentType,
  );
}

export function operatorVehicleQuickViewDocumentStatusLabel(
  locale: string,
  status: string,
): string {
  return operatorVehicleQuickViewCanonicalEnumLabel(
    locale,
    `documentExtraction.status.${status}` as TranslationKey,
    status,
  );
}

export function operatorVehicleQuickViewDocumentPrimaryLine(
  locale: string,
  doc: Pick<OperatorVehicleQuickViewDocumentPresentationRow, 'documentType' | 'status'>,
): string {
  return [
    operatorVehicleQuickViewDocumentTypeLabel(locale, doc.documentType),
    operatorVehicleQuickViewDocumentStatusLabel(locale, doc.status),
  ].join(' · ');
}

export function operatorVehicleQuickViewDocumentSecondaryLine(
  locale: string,
  doc: OperatorVehicleQuickViewDocumentPresentationRow,
): string {
  return [
    doc.sourceFileName ?? '—',
    formatOperatorVehicleQuickViewDateTime(locale, doc.createdAt),
  ].join(' · ');
}
