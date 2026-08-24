/**
 * Operator Vehicle Quick View presentation adapter (P2.2.27 QV-G tasks + P2.2.28 header + P2.2.29 quick actions + P2.2.30 tool actions + P2.2.31 booking context + P2.2.32 rental health modules).
 * Machine status/task values stay unchanged; presentation maps to TranslationKey only.
 */
import type {
  ApiTaskPriority,
  ApiTaskStatus,
  RentalHealthModule,
  RentalHealthState,
  VehicleHealthResponse,
} from '../../lib/api';
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
