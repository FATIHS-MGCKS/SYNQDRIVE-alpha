/**
 * Composite HV snapshot persistence policy built on per-signal provider observation rules.
 *
 * Decides whether an incoming poll should create a new `hv_battery_health_snapshots` row.
 * Pure function — no DB, no UI.
 */

import type { HvBatterySignalObservedAt } from '../../dimo/mappers/dimo-battery-signal.mapper';
import {
  buildBatteryProviderObservationIdempotencyKey,
  evaluateBatteryProviderObservation,
  type BatteryProviderObservationOutcome,
} from './battery-provider-observation.policy';

export const HV_SNAPSHOT_PERSIST_REASONS = [
  'FIRST_OBSERVATION',
  'NEW_PROVIDER_TIMESTAMP',
  'CHARGING_STATE_CHANGE',
  'CABLE_STATE_CHANGE',
  'NEW_PROVIDER_SOH',
  'VALUE_CHANGE_NEW_TIMESTAMP',
] as const;

export type HvSnapshotPersistReason =
  (typeof HV_SNAPSHOT_PERSIST_REASONS)[number];

export const HV_SNAPSHOT_SKIP_REASONS = [
  'DUPLICATE_OBSERVATION',
  'STALE_REPLAY',
  'OUT_OF_ORDER',
  'INVALID_TIMESTAMP',
  'UNCHANGED_POLL',
] as const;

export type HvSnapshotSkipReason = (typeof HV_SNAPSHOT_SKIP_REASONS)[number];

export interface HvSnapshotLastObservationContext {
  socPercent: number;
  energyUsedKwh: number | null;
  energyObservedAt?: Date | null;
  isCharging: boolean;
  chargingCableConnected?: boolean | null;
  providerSohPercent?: number | null;
  recordedAt: Date;
  providerReceivedAt?: Date | null;
  idempotencyKey?: string | null;
}

export interface EvaluateHvSnapshotObservationInput {
  organizationId: string;
  vehicleId: string;
  providerSource: string;
  receivedAt: Date;
  socPercent: number;
  currentEnergyKwh?: number | null;
  isCharging?: boolean | null;
  cableConnected?: boolean | null;
  providerReportedSohPercent?: number | null;
  signalObservedAt?: HvBatterySignalObservedAt;
  lastSnapshot?: HvSnapshotLastObservationContext | null;
}

export interface HvSnapshotObservationDecision {
  shouldPersist: boolean;
  idempotencyKey: string | null;
  anchorObservedAt: Date | null;
  persistReasons: HvSnapshotPersistReason[];
  skipReason?: HvSnapshotSkipReason;
  signalOutcomes: Partial<Record<'soc' | 'currentEnergy' | 'providerSoh', BatteryProviderObservationOutcome>>;
}

const SOC_SIGNAL = 'powertrainTractionBatteryStateOfChargeCurrent';
const ENERGY_SIGNAL = 'powertrainTractionBatteryStateOfChargeCurrentEnergy';
const SOH_SIGNAL = 'powertrainTractionBatteryStateOfHealth';

function mapOutcomeToSkip(
  outcome: BatteryProviderObservationOutcome,
): HvSnapshotSkipReason {
  switch (outcome) {
    case 'STALE_REPLAY':
      return 'STALE_REPLAY';
    case 'OUT_OF_ORDER':
      return 'OUT_OF_ORDER';
    case 'INVALID_TIMESTAMP':
      return 'INVALID_TIMESTAMP';
    case 'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP':
    case 'DUPLICATE_OBSERVATION':
    default:
      return 'DUPLICATE_OBSERVATION';
  }
}

export function buildHvSnapshotIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  providerSource: string;
  anchorObservedAt: Date;
  persistReasons: HvSnapshotPersistReason[];
  socPercent: number;
  isCharging: boolean;
  cableConnected?: boolean | null;
  currentEnergyKwh?: number | null;
  providerReportedSohPercent?: number | null;
  signalObservedAt?: HvBatterySignalObservedAt;
}): string {
  const anchorMs = input.anchorObservedAt.getTime();

  if (input.persistReasons.includes('CHARGING_STATE_CHANGE')) {
    const chargingAt =
      input.signalObservedAt?.isCharging?.getTime() ?? anchorMs;
    return [
      'hv-snap',
      input.organizationId,
      input.vehicleId,
      'charging',
      String(chargingAt),
      input.isCharging ? '1' : '0',
    ].join(':');
  }

  if (input.persistReasons.includes('CABLE_STATE_CHANGE')) {
    const cableAt =
      input.signalObservedAt?.cableConnected?.getTime() ?? anchorMs;
    return [
      'hv-snap',
      input.organizationId,
      input.vehicleId,
      'cable',
      String(cableAt),
      input.cableConnected === false ? '0' : '1',
    ].join(':');
  }

  if (
    input.persistReasons.includes('NEW_PROVIDER_SOH') &&
    input.providerReportedSohPercent != null
  ) {
    const sohAt = input.signalObservedAt?.providerSoh?.getTime() ?? anchorMs;
    return buildBatteryProviderObservationIdempotencyKey({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      signalName: SOH_SIGNAL,
      providerSource: input.providerSource,
      observedAt: new Date(sohAt),
      normalizedValue: input.providerReportedSohPercent,
    }).replace(/^battery-obs:/, 'hv-snap:');
  }

  return buildBatteryProviderObservationIdempotencyKey({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    signalName: SOC_SIGNAL,
    providerSource: input.providerSource,
    observedAt: input.anchorObservedAt,
    normalizedValue: input.socPercent,
  }).replace(/^battery-obs:/, 'hv-snap:');
}

export function evaluateHvSnapshotObservation(
  input: EvaluateHvSnapshotObservationInput,
): HvSnapshotObservationDecision {
  const receivedAt = input.receivedAt;
  const isCharging = input.isCharging ?? false;
  const cableConnected = input.cableConnected ?? false;
  const signalOutcomes: HvSnapshotObservationDecision['signalOutcomes'] = {};
  const persistReasons: HvSnapshotPersistReason[] = [];

  const anchorObservedAt =
    input.signalObservedAt?.soc
    ?? input.signalObservedAt?.currentEnergyKwh
    ?? null;

  if (!input.lastSnapshot) {
    if (!anchorObservedAt) {
      return {
        shouldPersist: false,
        idempotencyKey: null,
        anchorObservedAt: null,
        persistReasons: [],
        skipReason: 'INVALID_TIMESTAMP',
        signalOutcomes,
      };
    }

    return {
      shouldPersist: true,
      idempotencyKey: buildHvSnapshotIdempotencyKey({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSource: input.providerSource,
        anchorObservedAt,
        persistReasons: ['FIRST_OBSERVATION'],
        socPercent: input.socPercent,
        isCharging,
        cableConnected: input.cableConnected,
        currentEnergyKwh: input.currentEnergyKwh,
        providerReportedSohPercent: input.providerReportedSohPercent,
        signalObservedAt: input.signalObservedAt,
      }),
      anchorObservedAt,
      persistReasons: ['FIRST_OBSERVATION'],
      signalOutcomes,
    };
  }

  const last = input.lastSnapshot;

  if (isCharging !== last.isCharging) {
    persistReasons.push('CHARGING_STATE_CHANGE');
  }

  if (
    input.cableConnected != null &&
    last.chargingCableConnected != null &&
    cableConnected !== last.chargingCableConnected
  ) {
    persistReasons.push('CABLE_STATE_CHANGE');
  }

  const socDecision = evaluateBatteryProviderObservation({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    signalName: SOC_SIGNAL,
    providerSource: input.providerSource,
    normalizedValue: input.socPercent,
    observedAt: input.signalObservedAt?.soc,
    receivedAt,
    lastStored: {
      observedAt: last.recordedAt,
      normalizedValue: last.socPercent,
      receivedAt: last.providerReceivedAt,
      idempotencyKey: last.idempotencyKey,
    },
  });
  signalOutcomes.soc = socDecision.outcome;
  if (socDecision.shouldPersist) {
    persistReasons.push('NEW_PROVIDER_TIMESTAMP');
  }

  if (input.currentEnergyKwh != null && last.energyUsedKwh != null) {
    const energyDecision = evaluateBatteryProviderObservation({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      signalName: ENERGY_SIGNAL,
      providerSource: input.providerSource,
      normalizedValue: input.currentEnergyKwh,
      observedAt: input.signalObservedAt?.currentEnergyKwh,
      receivedAt,
      lastStored: {
        observedAt: last.energyObservedAt ?? last.recordedAt,
        normalizedValue: last.energyUsedKwh,
        receivedAt: last.providerReceivedAt,
        idempotencyKey: last.idempotencyKey,
      },
    });
    signalOutcomes.currentEnergy = energyDecision.outcome;
    if (energyDecision.shouldPersist && !socDecision.shouldPersist) {
      persistReasons.push('VALUE_CHANGE_NEW_TIMESTAMP');
    }
  }

  if (input.providerReportedSohPercent != null) {
    const sohDecision = evaluateBatteryProviderObservation({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      signalName: SOH_SIGNAL,
      providerSource: input.providerSource,
      normalizedValue: input.providerReportedSohPercent,
      observedAt: input.signalObservedAt?.providerSoh,
      receivedAt,
      lastStored:
        last.providerSohPercent != null
          ? {
              observedAt:
                input.signalObservedAt?.providerSoh ?? last.recordedAt,
              normalizedValue: last.providerSohPercent,
              receivedAt: last.providerReceivedAt,
              idempotencyKey: last.idempotencyKey,
            }
          : null,
    });
    signalOutcomes.providerSoh = sohDecision.outcome;
    if (sohDecision.shouldPersist) {
      persistReasons.push('NEW_PROVIDER_SOH');
    }
  }

  if (persistReasons.length > 0) {
    const resolvedAnchor = anchorObservedAt ?? last.recordedAt;
    return {
      shouldPersist: true,
      idempotencyKey: buildHvSnapshotIdempotencyKey({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSource: input.providerSource,
        anchorObservedAt: resolvedAnchor,
        persistReasons,
        socPercent: input.socPercent,
        isCharging,
        cableConnected: input.cableConnected,
        currentEnergyKwh: input.currentEnergyKwh,
        providerReportedSohPercent: input.providerReportedSohPercent,
        signalObservedAt: input.signalObservedAt,
      }),
      anchorObservedAt: resolvedAnchor,
      persistReasons,
      signalOutcomes,
    };
  }

  return {
    shouldPersist: false,
    idempotencyKey: socDecision.idempotencyKey,
    anchorObservedAt,
    persistReasons: [],
    skipReason:
      socDecision.outcome === 'DUPLICATE_OBSERVATION' ||
      socDecision.outcome === 'STALE_REPLAY'
        ? 'UNCHANGED_POLL'
        : mapOutcomeToSkip(socDecision.outcome),
    signalOutcomes,
  };
}
