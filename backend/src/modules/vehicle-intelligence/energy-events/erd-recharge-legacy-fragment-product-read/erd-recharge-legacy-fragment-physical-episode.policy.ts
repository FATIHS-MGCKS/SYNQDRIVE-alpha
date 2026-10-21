import type { VehicleEnergyEvent } from '@prisma/client';
import { intervalsOverlap } from '../erd-recharge-shadow-parity/erd-recharge-shadow-pairing.policy';

export interface LegacyFragmentHvPhysicalAnchor {
  dimoSegmentId: string;
  startAt: Date;
  endAt: Date;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
}

const TELEMETRY_EPSILON_KWH = 0.25;
const TELEMETRY_EPSILON_SOC = 0.5;

export interface RechargeTelemetryEnvelope {
  energyStartKwh: number;
  energyEndKwh: number;
  socStartPercent: number;
  socEndPercent: number;
}

export function readRechargeTelemetryEnvelope(
  row: VehicleEnergyEvent,
): RechargeTelemetryEnvelope | null {
  const meta =
    row.rawDetectionMeta != null && typeof row.rawDetectionMeta === 'object'
      ? (row.rawDetectionMeta as Record<string, unknown>)
      : null;
  if (!meta) return null;
  const energyStartKwh = meta.energyStartKwh;
  const energyEndKwh = meta.energyEndKwh;
  const socStartPercent = meta.socStartPercent;
  const socEndPercent = meta.socEndPercent;
  if (
    typeof energyStartKwh !== 'number' ||
    typeof energyEndKwh !== 'number' ||
    typeof socStartPercent !== 'number' ||
    typeof socEndPercent !== 'number' ||
    !Number.isFinite(energyStartKwh) ||
    !Number.isFinite(energyEndKwh) ||
    !Number.isFinite(socStartPercent) ||
    !Number.isFinite(socEndPercent)
  ) {
    return null;
  }
  return {
    energyStartKwh,
    energyEndKwh,
    socStartPercent,
    socEndPercent,
  };
}

export function findHvPhysicalAnchorForDimo(
  dimoSegmentId: string | null | undefined,
  anchors: LegacyFragmentHvPhysicalAnchor[],
): LegacyFragmentHvPhysicalAnchor | null {
  const dimo = dimoSegmentId?.trim() ?? '';
  if (dimo === '') return null;
  return anchors.find((anchor) => anchor.dimoSegmentId === dimo) ?? null;
}

/** Primary native physical episode anchor — exact DIMO id match to HvChargeSession segment. */
export function isHvProvenPrimaryEpisodeEnvelope(
  envelope: VehicleEnergyEvent,
  anchors: LegacyFragmentHvPhysicalAnchor[],
): boolean {
  const anchor = findHvPhysicalAnchorForDimo(envelope.dimoSegmentId, anchors);
  if (!anchor) return false;
  return intervalsOverlap(
    envelope.startTime,
    envelope.endTime,
    anchor.startAt,
    anchor.endAt,
  );
}

export function isHvPrimaryAnchorLegacyRow(
  row: VehicleEnergyEvent,
  anchors: LegacyFragmentHvPhysicalAnchor[],
): boolean {
  return findHvPhysicalAnchorForDimo(row.dimoSegmentId, anchors) != null;
}

/**
 * Cross-episode identity conflict (E5.4A-aligned): legacy row strongly binds to a different HV anchor
 * than the proposed owner envelope.
 */
export function hasHvCrossEpisodeIdentityConflict(input: {
  legacy: VehicleEnergyEvent;
  ownerEnvelope: VehicleEnergyEvent;
  anchors: LegacyFragmentHvPhysicalAnchor[];
}): boolean {
  const legacyAnchor = findHvPhysicalAnchorForDimo(input.legacy.dimoSegmentId, input.anchors);
  const ownerAnchor = findHvPhysicalAnchorForDimo(
    input.ownerEnvelope.dimoSegmentId,
    input.anchors,
  );
  if (legacyAnchor == null || ownerAnchor == null) return false;
  return legacyAnchor.dimoSegmentId !== ownerAnchor.dimoSegmentId;
}

/**
 * Fragment telemetry must nest inside owner envelope telemetry (fail-closed when meta missing).
 */
export function isFragmentTelemetryConsistentWithEnvelope(
  fragment: VehicleEnergyEvent,
  envelope: VehicleEnergyEvent,
): boolean {
  const fragmentTelemetry = readRechargeTelemetryEnvelope(fragment);
  const envelopeTelemetry = readRechargeTelemetryEnvelope(envelope);
  if (fragmentTelemetry == null || envelopeTelemetry == null) {
    return false;
  }
  if (
    fragmentTelemetry.energyStartKwh <
      envelopeTelemetry.energyStartKwh - TELEMETRY_EPSILON_KWH ||
    fragmentTelemetry.energyEndKwh >
      envelopeTelemetry.energyEndKwh + TELEMETRY_EPSILON_KWH
  ) {
    return false;
  }
  if (
    fragmentTelemetry.socStartPercent <
      envelopeTelemetry.socStartPercent - TELEMETRY_EPSILON_SOC ||
    fragmentTelemetry.socEndPercent >
      envelopeTelemetry.socEndPercent + TELEMETRY_EPSILON_SOC
  ) {
    return false;
  }
  return true;
}

/**
 * Distinct nested physical session: fragment starts a materially separate SOC/energy band
 * (not a sliding-window slice of the same episode).
 */
export function indicatesDistinctNestedPhysicalSession(
  fragment: VehicleEnergyEvent,
  envelope: VehicleEnergyEvent,
): boolean {
  const fragmentTelemetry = readRechargeTelemetryEnvelope(fragment);
  const envelopeTelemetry = readRechargeTelemetryEnvelope(envelope);
  if (fragmentTelemetry == null || envelopeTelemetry == null) {
    return true;
  }
  if (
    fragmentTelemetry.socStartPercent <
    envelopeTelemetry.socStartPercent - TELEMETRY_EPSILON_SOC
  ) {
    return true;
  }
  if (
    fragmentTelemetry.energyStartKwh <
    envelopeTelemetry.energyStartKwh - TELEMETRY_EPSILON_KWH
  ) {
    return true;
  }
  return false;
}
