import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

/** Read-only Prisma surface for LV operational condition input assembly (ops harness + Nest). */
export type LvOperationalConditionInputPrismaPort = Pick<
  PrismaService,
  'vehicleBatterySpec' | 'batteryFeatures' | 'batteryGeneralizedEvidenceObservation'
>;
import {
  normalizeBatteryType,
  selectBestBatterySpec,
} from '../../battery-status';
import { dedupeObservationsBySourceMeasurementId } from '../lv-measured-intelligence/lv-measured-intelligence-dedup.policy';
import { mapEvidenceClassToOperationalContext } from '../lv-measured-intelligence/lv-measured-intelligence-context.policy';
import { LvMeasuredIntelligenceReadService } from '../lv-measured-intelligence/lv-measured-intelligence-read.service';
import { LV_OPERATIONAL_CONDITION_MODEL_VERSION } from './lv-operational-condition-v1.constants';
import type {
  LvOperationalConditionInputV1,
  LvOperationalConditionObservationV1,
} from './lv-operational-condition-v1.types';
import {
  dedupeConditionObservationsBySourceMeasurementId,
  isEligibleRestObservationForConditionV1,
  selectLatestEligibleRestObservation,
} from './lv-operational-condition-observation.policy';

const GE_LOAD_SELECT = {
  id: true,
  sourceMeasurementId: true,
  restSessionId: true,
  voltage: true,
  voltageObservedAt: true,
  providerObservationAt: true,
  evidenceClass: true,
  actualRestAgeMs: true,
  isLvCharging: true,
  engineRunning: true,
  temperatureC: true,
  createdAt: true,
} as const;

export async function buildLvOperationalConditionInputV1(
  deps: {
    prisma: LvOperationalConditionInputPrismaPort;
    readModel: LvMeasuredIntelligenceReadService;
  },
  input: {
    organizationId: string;
    vehicleId: string;
    measuredFrom?: Date;
    measuredTo?: Date;
    observationLimit?: number;
    sessionLimit?: number;
  },
): Promise<LvOperationalConditionInputV1> {
  const measured = await deps.readModel.readVehicleIntelligence({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    measuredFrom: input.measuredFrom,
    measuredTo: input.measuredTo,
    observationLimit: input.observationLimit,
    sessionLimit: input.sessionLimit,
  });

  const [specs, batteryFeatures] = await Promise.all([
    deps.prisma.vehicleBatterySpec.findMany({
      where: { vehicleId: input.vehicleId },
    }),
    deps.prisma.batteryFeatures.findUnique({
      where: { vehicleId: input.vehicleId },
      select: {
        crankTripId: true,
        crankAt: true,
        vPreCrank: true,
        vMinCrank: true,
        crankDrop: true,
        vRecovery5s: true,
        vRecovery30s: true,
        crankObservationCount: true,
      },
    }),
  ]);
  const bestSpec = selectBestBatterySpec(specs);
  const normalizedType = normalizeBatteryType(bestSpec?.batteryType);

  const geRows = await deps.prisma.batteryGeneralizedEvidenceObservation.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      voltage: { not: null },
    },
    orderBy: { voltageObservedAt: 'desc' },
    take: input.observationLimit ?? 500,
    select: GE_LOAD_SELECT,
  });

  const dedupedRows = dedupeObservationsBySourceMeasurementId(geRows);

  const mapRow = (row: (typeof dedupedRows)[number]): LvOperationalConditionObservationV1 => ({
    observationId: row.id,
    sourceMeasurementId: row.sourceMeasurementId,
    restSessionId: row.restSessionId,
    voltageV: row.voltage ?? 0,
    voltageObservedAt: row.voltageObservedAt?.toISOString() ?? '',
    providerObservationAt: row.providerObservationAt?.toISOString() ?? null,
    operationalContext: mapEvidenceClassToOperationalContext(
      row.evidenceClass,
      row.isLvCharging,
    ),
    evidenceClass: row.evidenceClass,
    actualRestAgeHours:
      row.actualRestAgeMs != null ? row.actualRestAgeMs / (60 * 60 * 1000) : null,
    temperatureC: row.temperatureC,
    isLvCharging: row.isLvCharging,
    engineRunning: row.engineRunning,
  });

  const observations = dedupedRows.map(mapRow);
  const dedupedObservations = dedupeConditionObservationsBySourceMeasurementId(observations);
  const eligibleRestObservations = dedupedObservations.filter(isEligibleRestObservationForConditionV1);
  const latestEligibleRestObservation = selectLatestEligibleRestObservation(dedupedObservations);
  const wakeVoltageObservations = dedupedObservations.filter(
    (o) => o.evidenceClass === BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
  );

  const latestGlobalObservation = measured.latestMeasured
    ? {
        observationId: measured.latestMeasured.observationId,
        sourceMeasurementId: measured.latestMeasured.sourceMeasurementId,
        restSessionId: measured.latestMeasured.restSessionId ?? null,
        voltageV: measured.latestMeasured.voltageV,
        voltageObservedAt: measured.latestMeasured.voltageObservedAt,
        providerObservationAt: measured.latestMeasured.providerObservationAt ?? null,
        operationalContext: measured.latestMeasured.operationalContext,
        evidenceClass: measured.latestMeasured.evidenceClass,
        actualRestAgeHours: measured.latestMeasured.actualRestAgeHours,
        temperatureC: null,
        isLvCharging: measured.latestMeasured.isLvCharging,
        engineRunning: measured.latestMeasured.engineRunning,
      }
    : null;

  const sessionFeatures = measured.restSessionEpisodes
    .filter((ep) => ep.derivedFeatures)
    .map((ep) => ({
      restSessionId: ep.restSessionId,
      robustRestSlopeMvPerHour: ep.derivedFeatures!.robustRestSlopeMvPerHour,
      slopeInterpretability: ep.derivedFeatures!.slopeInterpretability,
      slopeLimitationCodes: ep.derivedFeatures!.slopeLimitationCodes,
      numberOfValidRestPoints: ep.derivedFeatures!.numberOfValidRestPoints,
      observationSpanMs: ep.derivedFeatures!.observationSpanMs,
    }));

  return {
    modelVersion: LV_OPERATIONAL_CONDITION_MODEL_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    evaluatedAtIso: new Date().toISOString(),
    chemistry: {
      normalizedType,
      batterySpecId: bestSpec?.id ?? null,
      sourceType: bestSpec?.sourceType ?? null,
      sourceConfidence: bestSpec?.sourceConfidence ?? null,
      nominalVoltageV: bestSpec?.batteryVolt ?? null,
      ampereHours: bestSpec?.batteryAmpere ?? null,
      authority: bestSpec ? 'VEHICLE_BATTERY_SPEC' : 'NONE',
      restingThresholdAuthority: 'BATTERY_STATUS_CLASSIFY_RESTING_VOLTAGE_V1',
    },
    openProviderObservabilityGapCount: measured.provenance.openProviderObservabilityGapCount,
    historicalQueryMode: measured.provenance.historicalQueryMode,
    inputCoverageIncomplete: measured.provenance.inputCoverageIncomplete,
    historicalObservationsTruncated: measured.provenance.historicalObservationsTruncated,
    eligibleRestObservations,
    latestGlobalObservation,
    latestEligibleRestObservation,
    wakeVoltageObservations,
    sessionFeatures,
    crankEvidence: batteryFeatures
      ? {
          source: 'BATTERY_FEATURES',
          crankTripId: batteryFeatures.crankTripId,
          crankAtIso: batteryFeatures.crankAt?.toISOString() ?? null,
          vPreCrankV: batteryFeatures.vPreCrank,
          vMinCrankV: batteryFeatures.vMinCrank,
          crankDropV: batteryFeatures.crankDrop,
          vRecovery5sV: batteryFeatures.vRecovery5s,
          vRecovery30sV: batteryFeatures.vRecovery30s,
          crankObservationCount: batteryFeatures.crankObservationCount,
        }
      : null,
  };
}
