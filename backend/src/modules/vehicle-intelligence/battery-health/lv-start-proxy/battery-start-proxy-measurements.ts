import {
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '@prisma/client';
import {
  START_PROXY_CADENCE_GATE_VERSION,
  START_PROXY_RECOVERY_30S_TARGET_MS,
  START_PROXY_RECOVERY_5S_TARGET_MS,
  type StartProxyCadenceGateResult,
} from './battery-start-proxy-cadence-gate';
import { sanitizeStartProxyVoltages } from './battery-start-proxy.policy';

/** Documented multi-measurement contract — bump when plan rules change. */
export const START_PROXY_MEASUREMENT_PLAN_VERSION = '1.0.0';

export const START_PROXY_TARGET_MESSARTS = [
  'PRE_START',
  'START_DIP_PROXY',
  'RECOVERY_5S',
  'RECOVERY_30S',
  'RECOVERY_PROXY',
] as const;

export type StartProxyTargetMessart = (typeof START_PROXY_TARGET_MESSARTS)[number];

export type StartProxyMeasurementPlanItem = {
  messart: StartProxyTargetMessart;
  type: BatteryMeasurementType;
  idempotencyKey: string;
  quality: BatteryMeasurementQuality;
  observedAt: Date;
  numericValue: number | null;
  unit: string | null;
  providerTimestamp: Date | null;
  context: Record<string, unknown>;
};

function isPlausibleDrop(drop: number | null): drop is number {
  return drop != null && Number.isFinite(drop) && drop >= 0 && drop <= 6;
}

function computeStartDipDrop(
  vPre: number | null,
  vMin: number | null,
): number | null {
  if (vPre == null || vMin == null) return null;
  const drop = vPre - vMin;
  return isPlausibleDrop(drop) ? drop : null;
}

export function buildStartProxyMeasurementIdempotencyKey(
  tripId: string,
  messart: StartProxyTargetMessart,
): string {
  switch (messart) {
    case 'PRE_START':
      return `pre-start-voltage:${tripId}`;
    case 'START_DIP_PROXY':
      return `start-dip-proxy:${tripId}`;
    case 'RECOVERY_5S':
      return `recovery-5s-voltage:${tripId}`;
    case 'RECOVERY_30S':
      return `recovery-30s-voltage:${tripId}`;
    case 'RECOVERY_PROXY':
      return `recovery-proxy-voltage:${tripId}`;
  }
}

function baseContext(input: {
  tripId: string;
  gate: StartProxyCadenceGateResult;
}): Record<string, unknown> {
  return {
    tripId: input.tripId,
    diagnosticOnly: true,
    measurementPlanVersion: START_PROXY_MEASUREMENT_PLAN_VERSION,
    cadenceGateVersion: START_PROXY_CADENCE_GATE_VERSION,
    cadenceGate: input.gate.metrics,
    reasonCode: input.gate.reasonCode,
    reasonLabel: input.gate.reasonLabel,
    medianIntervalMs: input.gate.metrics.medianIntervalMs,
    maxIntervalMs: input.gate.metrics.maxIntervalMs,
    coverageRatio: input.gate.metrics.coverageRatio,
  };
}

function statusMeasurements(
  input: {
    tripId: string;
    tripStartedAt: Date;
    gate: StartProxyCadenceGateResult;
  },
): StartProxyMeasurementPlanItem[] {
  const context = baseContext({ tripId: input.tripId, gate: input.gate });
  return START_PROXY_TARGET_MESSARTS.map((messart) => ({
    messart,
    type: messartToType(messart),
    idempotencyKey: buildStartProxyMeasurementIdempotencyKey(input.tripId, messart),
    quality: input.gate.quality,
    observedAt: input.tripStartedAt,
    numericValue: null,
    unit: null,
    providerTimestamp: null,
    context: {
      ...context,
      messart,
      statusOnly: true,
    },
  }));
}

function messartToType(messart: StartProxyTargetMessart): BatteryMeasurementType {
  switch (messart) {
    case 'PRE_START':
      return BatteryMeasurementType.PRE_START_VOLTAGE;
    case 'START_DIP_PROXY':
      return BatteryMeasurementType.START_DIP_PROXY;
    case 'RECOVERY_5S':
      return BatteryMeasurementType.RECOVERY_5S_VOLTAGE;
    case 'RECOVERY_30S':
      return BatteryMeasurementType.RECOVERY_30S_VOLTAGE;
    case 'RECOVERY_PROXY':
      return BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE;
  }
}

export function buildStartProxyMeasurementPlan(input: {
  tripId: string;
  tripStartedAt: Date;
  gate: StartProxyCadenceGateResult;
}): StartProxyMeasurementPlanItem[] {
  if (!input.gate.ok || input.gate.values == null) {
    return statusMeasurements(input);
  }

  const sanitized = sanitizeStartProxyVoltages({
    vPreCrank: input.gate.values.vPreCrank,
    vMinCrank: input.gate.values.vMinCrank,
    vRecovery5s: input.gate.values.vRecovery5s,
    vRecovery30s: input.gate.values.vRecovery30s,
  });
  const startDipDrop = computeStartDipDrop(
    sanitized.vPreCrank,
    sanitized.vMinCrank,
  );
  const quality = input.gate.quality;
  const shared = baseContext({ tripId: input.tripId, gate: input.gate });
  const plan: StartProxyMeasurementPlanItem[] = [];

  const preStart = input.gate.metrics.nearestPreStart;
  plan.push({
    messart: 'PRE_START',
    type: BatteryMeasurementType.PRE_START_VOLTAGE,
    idempotencyKey: buildStartProxyMeasurementIdempotencyKey(input.tripId, 'PRE_START'),
    quality,
    observedAt: preStart
      ? new Date(preStart.observedAt)
      : input.tripStartedAt,
    numericValue: sanitized.vPreCrank,
    unit: sanitized.vPreCrank != null ? 'V' : null,
    providerTimestamp: preStart ? new Date(preStart.observedAt) : null,
    context: {
      ...shared,
      messart: 'PRE_START',
      targetOffsetFromStartMs: preStart?.offsetFromStartMs ?? null,
      offsetFromTargetMs: preStart?.offsetFromStartMs ?? null,
    },
  });

  plan.push({
    messart: 'START_DIP_PROXY',
    type: BatteryMeasurementType.START_DIP_PROXY,
    idempotencyKey: buildStartProxyMeasurementIdempotencyKey(
      input.tripId,
      'START_DIP_PROXY',
    ),
    quality,
    observedAt: input.tripStartedAt,
    numericValue: startDipDrop,
    unit: startDipDrop != null ? 'V' : null,
    providerTimestamp: null,
    context: {
      ...shared,
      messart: 'START_DIP_PROXY',
      coarseProxy: true,
      notCrankMinimum: true,
      targetOffsetFromStartMs: 0,
      vPreCrank: sanitized.vPreCrank,
      startDipDrop,
    },
  });

  const recovery5s = input.gate.metrics.recovery5s;
  if (recovery5s?.withinTolerance) {
    plan.push({
      messart: 'RECOVERY_5S',
      type: BatteryMeasurementType.RECOVERY_5S_VOLTAGE,
      idempotencyKey: buildStartProxyMeasurementIdempotencyKey(
        input.tripId,
        'RECOVERY_5S',
      ),
      quality,
      observedAt: new Date(recovery5s.observedAt),
      numericValue: sanitized.vRecovery5s,
      unit: sanitized.vRecovery5s != null ? 'V' : null,
      providerTimestamp: new Date(recovery5s.observedAt),
      context: {
        ...shared,
        messart: 'RECOVERY_5S',
        targetOffsetFromStartMs: START_PROXY_RECOVERY_5S_TARGET_MS,
        offsetFromTargetMs: recovery5s.offsetFromTargetMs,
        recoveryLabel: 'RECOVERY_5S',
      },
    });
  }

  const recovery30s = input.gate.metrics.recovery30s;
  if (recovery30s?.withinTolerance) {
    plan.push({
      messart: 'RECOVERY_30S',
      type: BatteryMeasurementType.RECOVERY_30S_VOLTAGE,
      idempotencyKey: buildStartProxyMeasurementIdempotencyKey(
        input.tripId,
        'RECOVERY_30S',
      ),
      quality,
      observedAt: new Date(recovery30s.observedAt),
      numericValue: sanitized.vRecovery30s,
      unit: sanitized.vRecovery30s != null ? 'V' : null,
      providerTimestamp: new Date(recovery30s.observedAt),
      context: {
        ...shared,
        messart: 'RECOVERY_30S',
        targetOffsetFromStartMs: START_PROXY_RECOVERY_30S_TARGET_MS,
        offsetFromTargetMs: recovery30s.offsetFromTargetMs,
        recoveryLabel: 'RECOVERY_30S',
      },
    });
  }

  const proxyCandidates = [
    recovery5s != null && !recovery5s.withinTolerance
      ? {
          targetOffsetFromStartMs: START_PROXY_RECOVERY_5S_TARGET_MS,
          point: recovery5s,
          voltage: recovery5s.voltage,
        }
      : null,
    recovery30s != null && !recovery30s.withinTolerance
      ? {
          targetOffsetFromStartMs: START_PROXY_RECOVERY_30S_TARGET_MS,
          point: recovery30s,
          voltage: recovery30s.voltage,
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry != null);

  if (proxyCandidates.length > 0) {
    const primary =
      proxyCandidates.find(
        (entry) =>
          entry.targetOffsetFromStartMs === START_PROXY_RECOVERY_30S_TARGET_MS,
      ) ?? proxyCandidates[0];
    const sanitizedProxyVoltage = sanitizeStartProxyVoltages({
      vPreCrank: null,
      vMinCrank: null,
      vRecovery5s: primary.voltage,
      vRecovery30s: primary.voltage,
    }).vRecovery5s;

    plan.push({
      messart: 'RECOVERY_PROXY',
      type: BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE,
      idempotencyKey: buildStartProxyMeasurementIdempotencyKey(
        input.tripId,
        'RECOVERY_PROXY',
      ),
      quality,
      observedAt: new Date(primary.point.observedAt),
      numericValue: sanitizedProxyVoltage,
      unit: sanitizedProxyVoltage != null ? 'V' : null,
      providerTimestamp: new Date(primary.point.observedAt),
      context: {
        ...shared,
        messart: 'RECOVERY_PROXY',
        recoveryLabel: 'RECOVERY_PROXY',
        targetOffsetFromStartMs: primary.targetOffsetFromStartMs,
        offsetFromTargetMs: primary.point.offsetFromTargetMs,
        proxyTargets: proxyCandidates.map((entry) => ({
          targetOffsetFromStartMs: entry.targetOffsetFromStartMs,
          offsetFromTargetMs: entry.point.offsetFromTargetMs,
          observedAt: entry.point.observedAt,
        })),
      },
    });
  }

  return plan;
}
