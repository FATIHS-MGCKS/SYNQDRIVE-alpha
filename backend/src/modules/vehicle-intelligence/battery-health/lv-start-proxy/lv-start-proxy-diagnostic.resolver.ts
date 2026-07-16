import {
  BatteryMeasurementQuality,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import {
  presentBatteryDataQuality,
  type BatteryDataQualityStatus,
} from '../battery-data-quality';
import {
  getLvStartProxyScoreWeightPercent,
  isBatteryV2StartProxyEnabled,
  isLvStartProxyAlertEligible,
  isLvStartProxyReadinessEligible,
  isLvStartProxyTaskEligible,
  LV_START_PROXY_UI_LABEL_DE,
  resolveLvStartProxyAvailability,
  resolveLvStartProxyMessartClassification,
  type LvStartProxyAvailability,
  type LvStartProxyMessartClassification,
} from './lv-start-proxy-diagnostic.policy';
import { START_PROXY_TARGET_MESSARTS } from './battery-start-proxy-measurements';

const START_PROXY_MEASUREMENT_TYPES = [
  BatteryMeasurementType.PRE_START_VOLTAGE,
  BatteryMeasurementType.START_DIP_PROXY,
  BatteryMeasurementType.RECOVERY_5S_VOLTAGE,
  BatteryMeasurementType.RECOVERY_30S_VOLTAGE,
  BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE,
] as const;

export type LvStartProxyMeasurementDiagnostic = {
  messart: string;
  measurementType: BatteryMeasurementType;
  classification: LvStartProxyMessartClassification;
  displayLabelDe: string;
  quality: BatteryMeasurementQuality;
  dataQualityStatus: BatteryDataQualityStatus;
  numericValue: number | null;
  unit: string | null;
  observedAt: string;
  measurementAgeMs: number | null;
  offsetFromTargetMs: number | null;
  targetOffsetFromStartMs: number | null;
  medianIntervalMs: number | null;
  coverageRatio: number | null;
  dataQuality: ReturnType<typeof presentBatteryDataQuality>;
};

export type LvStartProxyDiagnosticView = {
  vehicleId: string;
  diagnosticOnly: true;
  featureEnabled: boolean;
  uiLabelDe: typeof LV_START_PROXY_UI_LABEL_DE;
  scoreWeightPercent: typeof getLvStartProxyScoreWeightPercent extends () => infer R
    ? R
    : 0;
  availability: LvStartProxyAvailability;
  availabilityLabelDe: string;
  operationalEffect: false;
  readinessEffect: false;
  alertEligible: false;
  taskEligible: false;
  operationalStatus: 'UNKNOWN';
  latestSession: {
    id: string;
    tripId: string | null;
    startedAt: string;
    status: string;
    pointCount: number | null;
  } | null;
  measurements: LvStartProxyMeasurementDiagnostic[];
};

function readContextNumber(
  context: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = context?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolveDataQualityStatus(
  quality: BatteryMeasurementQuality,
  numericValue: number | null,
): BatteryDataQualityStatus {
  if (
    quality === BatteryMeasurementQuality.VALID_PROXY ||
    quality === BatteryMeasurementQuality.VALID
  ) {
    return numericValue != null ? 'PROXY' : 'UNAVAILABLE';
  }
  if (quality === BatteryMeasurementQuality.NO_DATA) {
    return 'UNAVAILABLE';
  }
  if (
    quality === BatteryMeasurementQuality.INSUFFICIENT_CADENCE ||
    quality === BatteryMeasurementQuality.INSUFFICIENT_COVERAGE ||
    quality === BatteryMeasurementQuality.PROVIDER_DELAY ||
    quality === BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT
  ) {
    return 'STALE';
  }
  return 'UNAVAILABLE';
}

function messartLabelDe(messart: string): string {
  switch (messart) {
    case 'PRE_START':
      return 'Spannung vor Start';
    case 'START_DIP_PROXY':
      return LV_START_PROXY_UI_LABEL_DE;
    case 'RECOVERY_5S':
      return 'Erholung nach Start (5s)';
    case 'RECOVERY_30S':
      return 'Erholung nach Start (30s)';
    case 'RECOVERY_PROXY':
      return 'Erholung nach Start (geschätzt)';
    default:
      return messart;
  }
}

export async function resolveLvStartProxyDiagnostic(
  prisma: PrismaService,
  policyProfiles: BatteryPolicyProfileService,
  vehicleId: string,
  now: Date = new Date(),
): Promise<LvStartProxyDiagnosticView> {
  const policy = await policyProfiles.resolveForVehicle(vehicleId);
  const availability = resolveLvStartProxyAvailability({
    driveProfile: policy.driveProfile,
    startProxyAllowed: policy.startProxyAllowed,
    startProxyRequiresConfirmedIceStart: policy.startProxyRequiresConfirmedIceStart,
  });

  const latestSession = await prisma.batteryMeasurementSession.findFirst({
    where: {
      vehicleId,
      type: BatteryMeasurementSessionType.ICE_START_PROXY,
    },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      tripId: true,
      startedAt: true,
      status: true,
      metadata: true,
    },
  });

  const measurements = isBatteryV2StartProxyEnabled()
    ? await prisma.batteryMeasurement.findMany({
        where: {
          vehicleId,
          type: { in: [...START_PROXY_MEASUREMENT_TYPES] },
        },
        orderBy: { observedAt: 'desc' },
        take: 20,
        select: {
          type: true,
          quality: true,
          numericValue: true,
          unit: true,
          observedAt: true,
          context: true,
        },
      })
    : [];

  const latestByMessart = new Map<string, (typeof measurements)[number]>();
  for (const row of measurements) {
    const context =
      row.context && typeof row.context === 'object'
        ? (row.context as Record<string, unknown>)
        : {};
    const messart =
      typeof context.messart === 'string'
        ? context.messart
        : row.type.replace('_VOLTAGE', '').replace('_PROXY', '_PROXY');
    if (!latestByMessart.has(messart)) {
      latestByMessart.set(messart, row);
    }
  }

  const startDip = latestByMessart.get('START_DIP_PROXY');

  const diagnosticMeasurements: LvStartProxyMeasurementDiagnostic[] =
    START_PROXY_TARGET_MESSARTS.map((messart) => {
      const row = latestByMessart.get(messart);
      if (!row) {
        return {
          messart,
          measurementType:
            messart === 'PRE_START'
              ? BatteryMeasurementType.PRE_START_VOLTAGE
              : messart === 'START_DIP_PROXY'
                ? BatteryMeasurementType.START_DIP_PROXY
                : messart === 'RECOVERY_5S'
                  ? BatteryMeasurementType.RECOVERY_5S_VOLTAGE
                  : messart === 'RECOVERY_30S'
                    ? BatteryMeasurementType.RECOVERY_30S_VOLTAGE
                    : BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE,
          classification: resolveLvStartProxyMessartClassification(messart),
          displayLabelDe: messartLabelDe(messart),
          quality: BatteryMeasurementQuality.NO_DATA,
          dataQualityStatus: 'UNAVAILABLE',
          numericValue: null,
          unit: null,
          observedAt: latestSession?.startedAt.toISOString() ?? now.toISOString(),
          measurementAgeMs: null,
          offsetFromTargetMs: null,
          targetOffsetFromStartMs: null,
          medianIntervalMs: null,
          coverageRatio: null,
          dataQuality: presentBatteryDataQuality('UNAVAILABLE'),
        };
      }

      const context =
        row.context && typeof row.context === 'object'
          ? (row.context as Record<string, unknown>)
          : {};
      const observedAt = row.observedAt.toISOString();
      const dataQualityStatus = resolveDataQualityStatus(
        row.quality,
        row.numericValue,
      );

      return {
        messart,
        measurementType: row.type,
        classification: resolveLvStartProxyMessartClassification(messart),
        displayLabelDe: messartLabelDe(messart),
        quality: row.quality,
        dataQualityStatus,
        numericValue: row.numericValue,
        unit: row.unit,
        observedAt,
        measurementAgeMs: Math.max(0, now.getTime() - row.observedAt.getTime()),
        offsetFromTargetMs: readContextNumber(context, 'offsetFromTargetMs'),
        targetOffsetFromStartMs: readContextNumber(
          context,
          'targetOffsetFromStartMs',
        ),
        medianIntervalMs: readContextNumber(context, 'medianIntervalMs'),
        coverageRatio: readContextNumber(context, 'coverageRatio'),
        dataQuality: presentBatteryDataQuality(dataQualityStatus, observedAt),
      };
    });

  const sessionMetadata =
    latestSession?.metadata && typeof latestSession.metadata === 'object'
      ? (latestSession.metadata as Record<string, unknown>)
      : null;

  return {
    vehicleId,
    diagnosticOnly: true,
    featureEnabled: isBatteryV2StartProxyEnabled(),
    uiLabelDe: LV_START_PROXY_UI_LABEL_DE,
    scoreWeightPercent: getLvStartProxyScoreWeightPercent(),
    availability: availability.availability,
    availabilityLabelDe: availability.availabilityLabelDe,
    operationalEffect: false,
    readinessEffect: isLvStartProxyReadinessEligible(),
    alertEligible: isLvStartProxyAlertEligible(),
    taskEligible: isLvStartProxyTaskEligible(),
    operationalStatus: 'UNKNOWN' as const,
    latestSession: latestSession
      ? {
          id: latestSession.id,
          tripId: latestSession.tripId,
          startedAt: latestSession.startedAt.toISOString(),
          status: latestSession.status,
          pointCount:
            typeof sessionMetadata?.pointCount === 'number'
              ? sessionMetadata.pointCount
              : null,
        }
      : null,
    measurements: diagnosticMeasurements,
  };
}
