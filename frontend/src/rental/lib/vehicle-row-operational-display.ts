/**
 * Stage 2B — Shared display mapping for vehicle row operational dimensions.
 *
 * Consumers must not independently translate raw business / availability / readiness states.
 */
import type { StatusTone } from '../../components/patterns';
import type { TranslationKey } from '../i18n/translations/en';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { BusinessOperationalState } from './operational-projection/types';
import { OPERATIONAL_AVAILABILITY_STATE } from './operational-availability/types';
import { HEALTH_EVALUABILITY_STATE } from './fleet-health-evaluation/types';
import type { VehicleRowOperationalProjection } from './vehicle-row-operational-projection';

export type VehicleRowOperationalDisplaySurface = 'fleet_command' | 'ready_to_rent' | 'vehicle_detail';

export interface VehicleRowOperationalDisplayDimension {
  label: string;
  tone: StatusTone;
  localizationKey: TranslationKey;
  /** Machine authority dimension — never infer semantics from label text alone. */
  dimension: 'business' | 'operational' | 'readiness';
}

export interface VehicleRowOperationalDisplay {
  businessLabel: string;
  businessTone: StatusTone;
  businessLocalizationKey: TranslationKey;

  operationalLabel: string;
  operationalTone: StatusTone;
  operationalLocalizationKey: TranslationKey;

  readinessLabel: string;
  readinessTone: StatusTone;
  readinessLocalizationKey: TranslationKey;

  primaryRowStatusLabel: string;
  primaryRowStatusTone: StatusTone;
  primaryRowStatusLocalizationKey: TranslationKey;
  primaryRowStatusDimension: VehicleRowOperationalDisplayDimension['dimension'];

  business: VehicleRowOperationalDisplayDimension;
  operational: VehicleRowOperationalDisplayDimension;
  readiness: VehicleRowOperationalDisplayDimension;
  primaryRowStatus: VehicleRowOperationalDisplayDimension;
}

export interface GetVehicleRowOperationalDisplayInput {
  surface: VehicleRowOperationalDisplaySurface;
  locale?: 'en' | 'de';
  t?: (key: TranslationKey) => string;
}

const BUSINESS_STATE_KEYS: Record<BusinessOperationalState, TranslationKey> = {
  AVAILABLE: 'fleet.businessState.available',
  RENTED: 'fleet.businessState.rented',
  RESERVED: 'fleet.businessState.reserved',
  IN_SERVICE: 'fleet.businessState.inService',
  OUT_OF_SERVICE: 'fleet.businessState.outOfService',
  UNKNOWN: 'fleet.businessState.unknown',
};

const BUSINESS_STATE_TONES: Record<BusinessOperationalState, StatusTone> = {
  AVAILABLE: 'success',
  RENTED: 'info',
  RESERVED: 'warning',
  IN_SERVICE: 'critical',
  OUT_OF_SERVICE: 'critical',
  UNKNOWN: 'neutral',
};

function defaultTranslator(locale: 'en' | 'de'): (key: TranslationKey) => string {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

function resolveReadinessLocalizationKey(
  projection: VehicleRowOperationalProjection,
): TranslationKey {
  if (projection.readiness.isReadyToRent) {
    return projection.readiness.localizationKey;
  }

  if (projection.businessState === 'OUT_OF_SERVICE') {
    return 'fleet.rowProjection.readiness.blocked';
  }

  if (projection.operationalAvailability.state === OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE) {
    return 'fleet.rowProjection.readiness.blocked';
  }

  if (
    projection.operationalAvailability.state === OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION
  ) {
    return 'fleet.operationalAvailability.needsVerification';
  }

  if (projection.healthEvaluability === HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE) {
    return 'fleet.healthEvaluation.notEvaluable';
  }

  return projection.readiness.localizationKey;
}

function resolveReadinessTone(
  projection: VehicleRowOperationalProjection,
  localizationKey: TranslationKey,
): StatusTone {
  if (projection.readiness.isReadyToRent) {
    return 'success';
  }

  if (
    localizationKey === 'fleet.rowProjection.readiness.blocked' ||
    localizationKey === 'fleet.operationalAvailability.unavailable'
  ) {
    return 'critical';
  }

  if (localizationKey === 'fleet.operationalAvailability.needsVerification') {
    return 'watch';
  }

  if (localizationKey === 'fleet.healthEvaluation.notEvaluable') {
    return 'neutral';
  }

  return projection.readiness.tone;
}

function buildDimension(
  dimension: VehicleRowOperationalDisplayDimension['dimension'],
  label: string,
  tone: StatusTone,
  localizationKey: TranslationKey,
): VehicleRowOperationalDisplayDimension {
  return { dimension, label, tone, localizationKey };
}

export function getVehicleRowOperationalDisplay(
  projection: VehicleRowOperationalProjection,
  input: GetVehicleRowOperationalDisplayInput,
): VehicleRowOperationalDisplay {
  const locale = input.locale ?? 'de';
  const t = input.t ?? defaultTranslator(locale);

  const businessLocalizationKey = BUSINESS_STATE_KEYS[projection.businessState];
  const businessTone = BUSINESS_STATE_TONES[projection.businessState];
  const businessLabel = t(businessLocalizationKey);

  const operationalLocalizationKey = projection.operationalAvailability.localizationKey;
  const operationalTone = projection.operationalAvailability.tone;
  const operationalLabel = t(operationalLocalizationKey);

  const readinessLocalizationKey = resolveReadinessLocalizationKey(projection);
  const readinessTone = resolveReadinessTone(projection, readinessLocalizationKey);
  const readinessLabel = t(readinessLocalizationKey);

  const primary =
    input.surface === 'ready_to_rent'
      ? buildDimension('readiness', readinessLabel, readinessTone, readinessLocalizationKey)
      : input.surface === 'fleet_command'
        ? buildDimension('business', businessLabel, businessTone, businessLocalizationKey)
        : buildDimension(
            'operational',
            operationalLabel,
            operationalTone,
            operationalLocalizationKey,
          );

  return {
    businessLabel,
    businessTone,
    businessLocalizationKey,
    operationalLabel,
    operationalTone,
    operationalLocalizationKey,
    readinessLabel,
    readinessTone,
    readinessLocalizationKey,
    primaryRowStatusLabel: primary.label,
    primaryRowStatusTone: primary.tone,
    primaryRowStatusLocalizationKey: primary.localizationKey,
    primaryRowStatusDimension: primary.dimension,
    business: buildDimension('business', businessLabel, businessTone, businessLocalizationKey),
    operational: buildDimension(
      'operational',
      operationalLabel,
      operationalTone,
      operationalLocalizationKey,
    ),
    readiness: buildDimension('readiness', readinessLabel, readinessTone, readinessLocalizationKey),
    primaryRowStatus: primary,
  };
}
