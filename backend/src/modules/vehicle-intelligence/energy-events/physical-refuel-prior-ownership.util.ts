import type { PrismaClient } from '@prisma/client';
import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEvent,
} from '@prisma/client';
import type { RefuelRowForMatcher } from './physical-refuel-identity.matcher';
import { vehicleEnergyEventToRefuelRow } from './physical-refuel-row.mapper';

export type RefuelOwnershipClass = 'LEGACY_OWNED' | 'V2_OWNED' | 'BRIDGE_HISTORY';

export function classifyRefuelOwnership(
  event: Pick<VehicleEnergyEvent, 'createdAt' | 'kind'>,
  v2OwnershipCutoverAt: Date | null,
): RefuelOwnershipClass {
  if (!v2OwnershipCutoverAt) return 'LEGACY_OWNED';
  if (event.createdAt.getTime() < v2OwnershipCutoverAt.getTime()) return 'LEGACY_OWNED';
  return 'V2_OWNED';
}

/**
 * Loads bounded prior-finalization evidence for late-sibling checks:
 * - G2 reconciliation finals within identity bridge window
 * - Pre-G2 enriched legacy refuels within bridge window (no reconciliation row)
 */
export async function loadPriorFinalizationBridgeContext(
  prisma: Pick<PrismaClient, 'vehicleEnergyEvent' | 'vehicleEnergyEventRefuelReconciliation'>,
  params: {
    vehicleId: string;
    bridgeFrom: Date;
    bridgeTo: Date;
    currentCandidateIds: Set<string>;
  },
): Promise<{
  priorDistinctFinalizationIds: Set<string>;
  priorCanonicalFinalizationIds: Set<string>;
  priorFinalRowsById: Record<string, RefuelRowForMatcher>;
}> {
  const priorDistinctFinalizationIds = new Set<string>();
  const priorCanonicalFinalizationIds = new Set<string>();
  const priorFinalRowsById: Record<string, RefuelRowForMatcher> = {};

  const reconciledFinals = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: {
      vehicleId: params.vehicleId,
      enrichmentEligible: true,
      finalityState: {
        in: [
          PhysicalRefuelFinalityState.FINAL_DISTINCT,
          PhysicalRefuelFinalityState.FINAL_CANONICAL,
        ],
      },
      energyEvent: {
        createdAt: { gte: params.bridgeFrom, lte: params.bridgeTo },
      },
    },
    include: { energyEvent: true },
  });

  for (const row of reconciledFinals) {
    if (params.currentCandidateIds.has(row.energyEventId)) continue;
    priorFinalRowsById[row.energyEventId] = vehicleEnergyEventToRefuelRow(row.energyEvent);
    if (row.finalityState === PhysicalRefuelFinalityState.FINAL_DISTINCT) {
      priorDistinctFinalizationIds.add(row.energyEventId);
    } else {
      priorCanonicalFinalizationIds.add(row.energyEventId);
    }
  }

  const legacyEnriched = await prisma.vehicleEnergyEvent.findMany({
    where: {
      vehicleId: params.vehicleId,
      kind: EnergyEventKind.REFUEL,
      createdAt: { gte: params.bridgeFrom, lte: params.bridgeTo },
      refuelReconciliation: { is: null },
      fuelStationEnrichment: {
        is: {
          processingStatus: 'COMPLETED',
          resolutionStatus: { not: 'NO_COORDINATES' },
        },
      },
    },
  });

  for (const event of legacyEnriched) {
    if (params.currentCandidateIds.has(event.id)) continue;
    if (priorFinalRowsById[event.id]) continue;
    priorFinalRowsById[event.id] = vehicleEnergyEventToRefuelRow(event);
    priorDistinctFinalizationIds.add(event.id);
  }

  return {
    priorDistinctFinalizationIds,
    priorCanonicalFinalizationIds,
    priorFinalRowsById,
  };
}
