import { EnergyEventKind, type VehicleEnergyEvent } from '@prisma/client';
import { isCanonicalErdRechargeRow } from '../erd-recharge-product-read-dedupe/canonical-erd-recharge-row.policy';
import { isLegacyDirectDimoRechargeRow } from '../erd-recharge-shadow-parity/legacy-recharge-cohort.policy';
import { isValidLegacyInterval } from '../erd-recharge-shadow-parity/erd-recharge-shadow-fragment.policy';
import type { ErdRechargeShadowLegacySnapshot } from '../erd-recharge-shadow-parity/erd-recharge-shadow-parity.types';
import {
  isIncrementalSingleSegmentLegacyFragment,
  parseDimoRechargeSegmentId,
  sharesDimoRechargeToken,
} from './erd-recharge-legacy-fragment-identity.policy';
import { isStrictlyContainedInEnvelope } from './erd-recharge-legacy-fragment-interval.policy';
import {
  hasHvCrossEpisodeIdentityConflict,
  indicatesDistinctNestedPhysicalSession,
  isFragmentTelemetryConsistentWithEnvelope,
  isHvPrimaryAnchorLegacyRow,
  isHvProvenPrimaryEpisodeEnvelope,
  type LegacyFragmentHvPhysicalAnchor,
} from './erd-recharge-legacy-fragment-physical-episode.policy';

export type LegacyFragmentProductReadMetricResult =
  | 'flag_off'
  | 'envelope_preserved'
  | 'fragment_suppressed'
  | 'ambiguous_preserved'
  | 'malformed_preserved'
  | 'non_legacy_preserved'
  | 'unproven_episode_preserved'
  | 'identity_conflict_preserved'
  | 'telemetry_conflict_preserved';

export interface LegacyRechargeFragmentProductReadContext {
  hvPhysicalAnchors: LegacyFragmentHvPhysicalAnchor[];
}

export interface ApplyLegacyRechargeFragmentProductReadResult<T extends VehicleEnergyEvent> {
  visible: T[];
  metricResults: LegacyFragmentProductReadMetricResult[];
}

function sortRechargeRows<T extends VehicleEnergyEvent>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const startDiff = a.startTime.getTime() - b.startTime.getTime();
    if (startDiff !== 0) return startDiff;
    return a.id.localeCompare(b.id);
  });
}

function toLegacySnapshot(row: VehicleEnergyEvent): ErdRechargeShadowLegacySnapshot {
  return {
    vehicleEnergyEventId: row.id,
    dimoSegmentId: row.dimoSegmentId ?? '',
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationSeconds: row.durationSeconds,
    socDeltaPercent: row.socDeltaPercent,
    energyDeltaKwh: row.energyDeltaKwh,
    odometerStartKm: row.odometerStartKm,
    odometerEndKm: row.odometerEndKm,
    confidence: 'HIGH',
    startLatitude: row.startLatitude,
    startLongitude: row.startLongitude,
    endLatitude: row.endLatitude,
    endLongitude: row.endLongitude,
    coalescedFromSegmentIds: [],
  };
}

function isMaximalLegacyEnvelope(
  candidate: VehicleEnergyEvent,
  cohort: VehicleEnergyEvent[],
): boolean {
  for (const other of cohort) {
    if (other.id === candidate.id) continue;
    if (
      isStrictlyContainedInEnvelope({
        row: candidate,
        envelope: other,
      })
    ) {
      return false;
    }
  }
  return true;
}

function proveFragmentOwnedByHvEpisodeEnvelope(
  fragment: VehicleEnergyEvent,
  envelope: VehicleEnergyEvent,
  anchors: LegacyFragmentHvPhysicalAnchor[],
): boolean {
  if (fragment.id === envelope.id) return false;
  if (!isLegacyDirectDimoRechargeRow(fragment)) return false;
  if (!isLegacyDirectDimoRechargeRow(envelope)) return false;
  if (!isValidLegacyInterval(toLegacySnapshot(fragment))) return false;
  if (!isValidLegacyInterval(toLegacySnapshot(envelope))) return false;
  if (parseDimoRechargeSegmentId(fragment.dimoSegmentId) == null) return false;
  if (parseDimoRechargeSegmentId(envelope.dimoSegmentId) == null) return false;
  if (!sharesDimoRechargeToken(envelope, fragment)) return false;
  if (!isIncrementalSingleSegmentLegacyFragment(fragment)) return false;
  if (!isStrictlyContainedInEnvelope({ row: fragment, envelope })) return false;
  if (!isHvProvenPrimaryEpisodeEnvelope(envelope, anchors)) return false;
  if (isHvPrimaryAnchorLegacyRow(fragment, anchors)) return false;
  if (
    hasHvCrossEpisodeIdentityConflict({
      legacy: fragment,
      ownerEnvelope: envelope,
      anchors,
    })
  ) {
    return false;
  }
  if (indicatesDistinctNestedPhysicalSession(fragment, envelope)) return false;
  if (!isFragmentTelemetryConsistentWithEnvelope(fragment, envelope)) return false;
  return true;
}

function resolveEnvelopeOwnersForFragment(
  fragment: VehicleEnergyEvent,
  envelopes: VehicleEnergyEvent[],
  anchors: LegacyFragmentHvPhysicalAnchor[],
): VehicleEnergyEvent[] {
  return envelopes.filter((envelope) =>
    proveFragmentOwnedByHvEpisodeEnvelope(fragment, envelope, anchors),
  );
}

/**
 * Product-read collapse for proven legacy DIMO sliding-window fragments.
 * Requires HvChargeSession primary-pair anchor (exact native dimo) plus E5.4A containment,
 * incremental coalesce metadata, and consistent SOC/energy telemetry. Fail-open otherwise.
 */
export function applyLegacyRechargeFragmentProductRead<T extends VehicleEnergyEvent>(
  rechargeRows: T[],
  enabled: boolean,
  context: LegacyRechargeFragmentProductReadContext = { hvPhysicalAnchors: [] },
): ApplyLegacyRechargeFragmentProductReadResult<T> {
  if (!enabled) {
    return {
      visible: sortRechargeRows(rechargeRows),
      metricResults: ['flag_off'],
    };
  }

  const metricResults: LegacyFragmentProductReadMetricResult[] = [];
  const byVehicle = new Map<string, T[]>();
  for (const row of rechargeRows) {
    const bucket = byVehicle.get(row.vehicleId) ?? [];
    bucket.push(row);
    byVehicle.set(row.vehicleId, bucket);
  }

  const suppressedIds = new Set<string>();
  const anchors = context.hvPhysicalAnchors;

  for (const cohort of byVehicle.values()) {
    const legacyCohort = cohort.filter((row) => isLegacyDirectDimoRechargeRow(row));
    const maximalEnvelopes = legacyCohort.filter((row) =>
      isMaximalLegacyEnvelope(row, legacyCohort),
    );
    const episodeEnvelopes = maximalEnvelopes.filter((row) =>
      isHvProvenPrimaryEpisodeEnvelope(row, anchors),
    );

    for (const row of cohort) {
      if (isCanonicalErdRechargeRow(row)) {
        metricResults.push('non_legacy_preserved');
        continue;
      }
      if (!isLegacyDirectDimoRechargeRow(row)) {
        metricResults.push('non_legacy_preserved');
        continue;
      }

      const owners = resolveEnvelopeOwnersForFragment(row, episodeEnvelopes, anchors);
      if (owners.length > 1) {
        metricResults.push('ambiguous_preserved');
        continue;
      }
      if (owners.length === 0) {
        if (parseDimoRechargeSegmentId(row.dimoSegmentId) == null) {
          metricResults.push('malformed_preserved');
        } else if (
          isIncrementalSingleSegmentLegacyFragment(row) &&
          maximalEnvelopes.some((envelope) =>
            isStrictlyContainedInEnvelope({ row, envelope }),
          ) &&
          !episodeEnvelopes.some((envelope) =>
            isStrictlyContainedInEnvelope({ row, envelope }),
          )
        ) {
          metricResults.push('unproven_episode_preserved');
        } else {
          metricResults.push('envelope_preserved');
        }
        continue;
      }

      const owner = owners[0]!;
      if (owner.id === row.id) {
        metricResults.push('envelope_preserved');
        continue;
      }

      if (
        hasHvCrossEpisodeIdentityConflict({
          legacy: row,
          ownerEnvelope: owner,
          anchors,
        })
      ) {
        metricResults.push('identity_conflict_preserved');
        continue;
      }
      if (
        indicatesDistinctNestedPhysicalSession(row, owner) ||
        !isFragmentTelemetryConsistentWithEnvelope(row, owner)
      ) {
        metricResults.push('telemetry_conflict_preserved');
        continue;
      }

      suppressedIds.add(row.id);
      metricResults.push('fragment_suppressed');
    }
  }

  const visible = rechargeRows.filter((row) => !suppressedIds.has(row.id));

  return {
    visible: sortRechargeRows(visible),
    metricResults,
  };
}

export function applyLegacyRechargeFragmentProductReadToProductRows<
  T extends VehicleEnergyEvent,
>(
  rows: T[],
  enabled: boolean,
  context: LegacyRechargeFragmentProductReadContext = { hvPhysicalAnchors: [] },
): ApplyLegacyRechargeFragmentProductReadResult<T> {
  const recharges = rows.filter((row) => row.kind === EnergyEventKind.RECHARGE);
  const other = rows.filter((row) => row.kind !== EnergyEventKind.RECHARGE);
  const { visible, metricResults } = applyLegacyRechargeFragmentProductRead(
    recharges,
    enabled,
    context,
  );
  return {
    visible: [...other, ...visible],
    metricResults,
  };
}
