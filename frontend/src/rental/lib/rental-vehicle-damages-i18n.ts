/**
 * Rental Vehicle Damages presentation adapter (P2.2.61).
 * Payload enums, IDs, coordinates, and API contracts stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import type {
  DamageEvidenceStatus,
  DamageLiabilityStatus,
  DamageLocationView,
  DamageRentalImpact,
  DamageSeverity,
  DamageSource,
  DamageStatus,
} from './damage.types';
import { DESCRIPTION_MAX_LENGTH } from './damage.types';
import type { DamageRentalGate } from './damage-rental-impact';
import type { DamagePickupContext } from './damage-pickup-context';
import type { DamageQueueFilter } from '../components/damages/damage-control.utils';

export type VehicleDamagesTranslate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

export type VehicleDamageHostErrorKey =
  | 'vehicleDamages.hostError.loadFailed'
  | 'vehicleDamages.hostError.refreshFailed'
  | 'vehicleDamages.hostError.noVehicle'
  | 'vehicleDamages.hostError.orgMissing'
  | 'vehicleDamages.hostError.actionFailed'
  | 'vehicleDamages.hostError.taskAlreadyLinked'
  | 'vehicleDamages.hostError.taskNotEligible'
  | 'vehicleDamages.hostError.aiAnalysisFailed'
  | 'vehicleDamages.hostError.aiConfirmFailed';

export type VehicleDamageToastSuccessKey =
  | 'vehicleDamages.toast.damageRecorded'
  | 'vehicleDamages.toast.damageRecordedDescription'
  | 'vehicleDamages.toast.damagePositioned'
  | 'vehicleDamages.toast.damagePositionedDescription'
  | 'vehicleDamages.toast.photoAdded'
  | 'vehicleDamages.toast.photoAddedDescription'
  | 'vehicleDamages.toast.markedInRepair'
  | 'vehicleDamages.toast.markedRepaired'
  | 'vehicleDamages.toast.markedRepairedDescription'
  | 'vehicleDamages.toast.archived'
  | 'vehicleDamages.toast.liabilityUpdated'
  | 'vehicleDamages.toast.liabilityUpdatedDescription'
  | 'vehicleDamages.toast.depositPrepared'
  | 'vehicleDamages.toast.depositPreparedDescription'
  | 'vehicleDamages.toast.chargePrepared'
  | 'vehicleDamages.toast.chargePreparedDescription'
  | 'vehicleDamages.toast.repairTaskCreated'
  | 'vehicleDamages.toast.repairTaskCreatedDescription'
  | 'vehicleDamages.toast.damagesCreated'
  | 'vehicleDamages.toast.damagesCreatedDescription';

export type VehicleDamageToastErrorKey =
  | 'vehicleDamages.toast.actionFailed'
  | 'vehicleDamages.toast.taskNotCreated';

export type VehicleDamageValidationCode =
  | 'DAMAGE_TYPE_REQUIRED'
  | 'SEVERITY_REQUIRED'
  | 'DESCRIPTION_TOO_LONG'
  | 'ESTIMATED_COST_INVALID'
  | 'COORDINATES_REQUIRED'
  | 'COORDINATES_RANGE'
  | 'CREATE_FAILED'
  | 'REPAIR_COST_INVALID'
  | 'MARK_REPAIRED_FAILED'
  | 'CREATE_TASK_FAILED'
  | 'LIABILITY_SAVE_FAILED'
  | 'DEPOSIT_AMOUNT_INVALID'
  | 'DEPOSIT_PREPARE_FAILED'
  | 'CHARGE_AMOUNT_INVALID'
  | 'CHARGE_PREPARE_FAILED'
  | 'PHOTO_UNSUPPORTED_FORMAT'
  | 'PHOTO_TOO_LARGE'
  | 'PHOTO_UPLOAD_FAILED'
  | 'AI_PHOTOS_REQUIRED'
  | 'AI_SELECT_SUGGESTION'
  | 'DRAWER_ACTION_FAILED'
  | 'SECTION_ACTION_FAILED';

export type DamagePickupReasonCode =
  | 'NO_DAMAGE_SELECTED'
  | 'PICKUP_HANDOVER_SOURCE'
  | 'PICKUP_PROTOCOL_LISTED'
  | 'NOT_LINKED_RETURN'
  | 'POSSIBLE_PICKUP_MATCH_HIGH'
  | 'POSSIBLE_PICKUP_MATCH_LOW'
  | 'NEW_SINCE_PICKUP';

const VALIDATION_KEY_MAP: Record<VehicleDamageValidationCode, TranslationKey> = {
  DAMAGE_TYPE_REQUIRED: 'vehicleDamages.validation.damageTypeRequired',
  SEVERITY_REQUIRED: 'vehicleDamages.validation.severityRequired',
  DESCRIPTION_TOO_LONG: 'vehicleDamages.validation.descriptionMax',
  ESTIMATED_COST_INVALID: 'vehicleDamages.validation.estimatedCostInvalid',
  COORDINATES_REQUIRED: 'vehicleDamages.validation.coordinatesRequired',
  COORDINATES_RANGE: 'vehicleDamages.validation.coordinatesRange',
  CREATE_FAILED: 'vehicleDamages.validation.createFailed',
  REPAIR_COST_INVALID: 'vehicleDamages.validation.repairCostInvalid',
  MARK_REPAIRED_FAILED: 'vehicleDamages.validation.markRepairedFailed',
  CREATE_TASK_FAILED: 'vehicleDamages.validation.createTaskFailed',
  LIABILITY_SAVE_FAILED: 'vehicleDamages.validation.liabilitySaveFailed',
  DEPOSIT_AMOUNT_INVALID: 'vehicleDamages.validation.depositAmountInvalid',
  DEPOSIT_PREPARE_FAILED: 'vehicleDamages.validation.depositPrepareFailed',
  CHARGE_AMOUNT_INVALID: 'vehicleDamages.validation.chargeAmountInvalid',
  CHARGE_PREPARE_FAILED: 'vehicleDamages.validation.chargePrepareFailed',
  PHOTO_UNSUPPORTED_FORMAT: 'vehicleDamages.validation.photoUnsupportedFormat',
  PHOTO_TOO_LARGE: 'vehicleDamages.validation.photoTooLarge',
  PHOTO_UPLOAD_FAILED: 'vehicleDamages.validation.photoUploadFailed',
  AI_PHOTOS_REQUIRED: 'vehicleDamages.validation.aiPhotosRequired',
  AI_SELECT_SUGGESTION: 'vehicleDamages.validation.aiSelectSuggestion',
  DRAWER_ACTION_FAILED: 'vehicleDamages.validation.drawerActionFailed',
  SECTION_ACTION_FAILED: 'vehicleDamages.validation.sectionActionFailed',
};

export function resolveVehicleDamagesLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function vehicleDamagesFormattingLocale(locale: string | null | undefined): string {
  return getFormattingLocale(resolveVehicleDamagesLocale(locale));
}

function translateWithOperatorReuse(
  t: VehicleDamagesTranslate,
  operatorKey: TranslationKey,
  vehicleKey: TranslationKey,
  raw: string,
): string {
  const operatorTranslated = t(operatorKey);
  if (operatorTranslated !== operatorKey) return operatorTranslated;
  const vehicleTranslated = t(vehicleKey);
  if (vehicleTranslated !== vehicleKey) return vehicleTranslated;
  return raw;
}

export function resolveDamageTypeLabel(t: VehicleDamagesTranslate, value: string): string {
  return translateWithOperatorReuse(
    t,
    `operator.damageCapture.damageType.${value}` as TranslationKey,
    `vehicleDamages.damageType.${value}` as TranslationKey,
    value,
  );
}

export function resolveDamageSeverityLabel(
  t: VehicleDamagesTranslate,
  value: DamageSeverity | string,
): string {
  return translateWithOperatorReuse(
    t,
    `operator.damageCapture.severity.${value}` as TranslationKey,
    `vehicleDamages.severity.${value}` as TranslationKey,
    value,
  );
}

export function resolveDamageStatusLabel(t: VehicleDamagesTranslate, value: DamageStatus | string): string {
  const key = `vehicleDamages.status.${value}` as TranslationKey;
  const translated = t(key);
  return translated === key ? value : translated;
}

export function resolveDamageOldestTodayLabel(t: VehicleDamagesTranslate): string {
  return t('common.today');
}

export function resolveDamageLocationViewLabel(
  t: VehicleDamagesTranslate,
  value: DamageLocationView | string,
): string {
  if (value === 'UNKNOWN') {
    const sharedTranslated = t('vehicle.status.unknown');
    return sharedTranslated === 'vehicle.status.unknown' ? value : sharedTranslated;
  }
  const key = `vehicleDamages.locationView.${value}` as TranslationKey;
  const translated = t(key);
  return translated === key ? value : translated;
}

export function resolveRentalImpactLabel(
  t: VehicleDamagesTranslate,
  value: DamageRentalImpact | string,
): string {
  return translateWithOperatorReuse(
    t,
    `operator.damageCapture.rentalImpact.${value}` as TranslationKey,
    `vehicleDamages.rentalImpact.${value}` as TranslationKey,
    value,
  );
}

export function resolveEvidenceStatusLabel(
  t: VehicleDamagesTranslate,
  value: DamageEvidenceStatus | string,
): string {
  const key = `vehicleDamages.evidenceStatus.${value}` as TranslationKey;
  const translated = t(key);
  return translated === key ? value : translated;
}

export function resolveLiabilityStatusLabel(
  t: VehicleDamagesTranslate,
  value: DamageLiabilityStatus | string,
): string {
  const key = `vehicleDamages.liabilityStatus.${value}` as TranslationKey;
  const translated = t(key);
  return translated === key ? value : translated;
}

export function resolveDamageSourceLabel(t: VehicleDamagesTranslate, value: DamageSource | string): string {
  return translateWithOperatorReuse(
    t,
    `operator.damageCapture.source.${value}` as TranslationKey,
    `vehicleDamages.source.${value}` as TranslationKey,
    value,
  );
}

export function resolveDamageQueueFilterLabel(
  t: VehicleDamagesTranslate,
  filter: DamageQueueFilter,
): string {
  if (filter === 'all') return t('common.all');
  const key = `vehicleDamages.queueFilter.${filter}` as TranslationKey;
  return t(key);
}

export function resolveDamageRentalGateLabel(
  t: VehicleDamagesTranslate,
  gate: DamageRentalGate,
): string {
  if (gate === 'WATCH') {
    const sharedTranslated = t('vehicle.overview.card.watch');
    return sharedTranslated === 'vehicle.overview.card.watch' ? gate : sharedTranslated;
  }
  if (gate === 'RENTAL_BLOCKED') {
    const sharedTranslated = t('vehicle.overview.rentalBlocked');
    return sharedTranslated === 'vehicle.overview.rentalBlocked' ? gate : sharedTranslated;
  }
  const key = `vehicleDamages.rentalGate.${gate}` as TranslationKey;
  const translated = t(key);
  return translated === key ? gate : translated;
}

export function resolveDamagePickupContextLabel(
  t: VehicleDamagesTranslate,
  context: DamagePickupContext,
): string | null {
  if (context === 'NOT_APPLICABLE') return null;
  const key = `vehicleDamages.pickupContext.${context}` as TranslationKey;
  return t(key);
}

export function resolveDamagePickupReasonLabel(
  t: VehicleDamagesTranslate,
  code: DamagePickupReasonCode,
): string {
  const key = `vehicleDamages.pickupReason.${code}` as TranslationKey;
  const translated = t(key);
  return translated === key ? code : translated;
}

export function resolveDamageHostError(
  hostErrorKey: VehicleDamageHostErrorKey | null,
  backendMessage: string | null,
  t: VehicleDamagesTranslate,
): string | null {
  if (backendMessage) return backendMessage;
  if (!hostErrorKey) return null;
  return t(hostErrorKey);
}

export function resolveDamageToastSuccess(
  key: VehicleDamageToastSuccessKey,
  t: VehicleDamagesTranslate,
  vars?: Record<string, string | number>,
): string {
  return t(key, vars);
}

export function resolveDamageToastError(
  key: VehicleDamageToastErrorKey,
  t: VehicleDamagesTranslate,
  vars?: Record<string, string | number>,
): string {
  return t(key, vars);
}

export function resolveDamageValidationMessage(
  code: VehicleDamageValidationCode,
  t: VehicleDamagesTranslate,
  vars?: Record<string, string | number>,
): string {
  const key = VALIDATION_KEY_MAP[code];
  if (code === 'DESCRIPTION_TOO_LONG') {
    return t(key, { max: DESCRIPTION_MAX_LENGTH, ...vars });
  }
  if (code === 'PHOTO_TOO_LARGE') {
    return t(key, { maxMb: 6, ...vars });
  }
  return t(key, vars);
}

export function formatDamageDateLocale(
  locale: string | null | undefined,
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(vehicleDamagesFormattingLocale(locale));
}

export function formatDamageEuroCents(
  locale: string | null | undefined,
  cents: number | null | undefined,
): string | null {
  if (cents == null || cents < 0) return null;
  return new Intl.NumberFormat(vehicleDamagesFormattingLocale(locale), {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function resolveCanvasImageSourceLabel(
  t: VehicleDamagesTranslate,
  source: 'vehicle' | 'model' | 'blueprint',
): string {
  return t(`vehicleDamages.canvas.imageSource.${source}` as TranslationKey);
}

export function resolveMatchConfidenceLabel(
  t: VehicleDamagesTranslate,
  confidence: 'none' | 'low' | 'high',
): string {
  return t(`vehicleDamages.matchConfidence.${confidence}` as TranslationKey);
}

export function resolveRepairTaskPriorityLabel(t: VehicleDamagesTranslate, priority: string): string {
  if (priority === 'CRITICAL') {
    const sharedTranslated = t('vehicle.telemetry.critical');
    return sharedTranslated === 'vehicle.telemetry.critical' ? priority : sharedTranslated;
  }
  const key = `vehicleDamages.repairTask.priority.${priority}` as TranslationKey;
  const translated = t(key);
  return translated === key ? priority : translated;
}
