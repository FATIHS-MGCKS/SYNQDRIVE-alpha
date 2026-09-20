import type { PrismaClient } from '@prisma/client';
import {
  EnergyEventKind,
  FuelStationEnrichmentProcessingStatus,
  FuelStationEnrichmentResolutionStatus,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import type { RefuelRowForMatcher } from './physical-refuel-identity.matcher';
import { vehicleEnergyEventToRefuelRow } from './physical-refuel-row.mapper';
import {
  isIrreversibleEnrichmentConsumption,
  reconciliationImpliesLateSiblingAfterFinalization,
} from './physical-refuel-late-sibling-authority.util';

type ReconciliationWithEnrichment = VehicleEnergyEventRefuelReconciliation & {
  energyEvent: VehicleEnergyEvent & {
    fuelStationEnrichment?: {
      processingStatus: FuelStationEnrichmentProcessingStatus;
      resolutionStatus: FuelStationEnrichmentResolutionStatus | null;
    } | null;
  };
};

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
  irreversiblePriorFinalOwnerIds: Set<string>;
}> {
  const priorDistinctFinalizationIds = new Set<string>();
  const priorCanonicalFinalizationIds = new Set<string>();
  const priorFinalRowsById: Record<string, RefuelRowForMatcher> = {};
  const irreversiblePriorFinalOwnerIds = new Set<string>();

  const noteIrreversibleOwner = (
    row: Pick<
      VehicleEnergyEventRefuelReconciliation,
      'energyEventId' | 'enrichmentEnqueuedAt'
    > & {
      fuelStationEnrichment?: ReconciliationWithEnrichment['energyEvent']['fuelStationEnrichment'];
    },
  ) => {
    if (
      isIrreversibleEnrichmentConsumption({
        enrichmentEnqueuedAt: row.enrichmentEnqueuedAt,
        fuelStationEnrichment: row.fuelStationEnrichment ?? null,
      })
    ) {
      irreversiblePriorFinalOwnerIds.add(row.energyEventId);
    }
  };

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
    include: {
      energyEvent: { include: { fuelStationEnrichment: true } },
    },
  });

  for (const row of reconciledFinals) {
    // Include FINAL reconciled rows in prior bridge even when they remain in the
    // active candidate window — required for incremental late-native triggers (L8/L9)
    // where the finalized owner and late sibling are reconciled in one batch.
    priorFinalRowsById[row.energyEventId] = vehicleEnergyEventToRefuelRow(row.energyEvent);
    if (row.finalityState === PhysicalRefuelFinalityState.FINAL_DISTINCT) {
      priorDistinctFinalizationIds.add(row.energyEventId);
    } else {
      priorCanonicalFinalizationIds.add(row.energyEventId);
    }
    noteIrreversibleOwner({
      energyEventId: row.energyEventId,
      enrichmentEnqueuedAt: row.enrichmentEnqueuedAt,
      fuelStationEnrichment: row.energyEvent.fuelStationEnrichment,
    });
  }

  const durableLateSiblingRows = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
    where: {
      vehicleId: params.vehicleId,
      finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
      OR: [{ lateSiblingConflict: true }, { reason: 'late_sibling_after_finalization' }],
      energyEvent: {
        createdAt: { gte: params.bridgeFrom, lte: params.bridgeTo },
      },
    },
    include: {
      energyEvent: { include: { fuelStationEnrichment: true } },
    },
  });

  const durableOwnerIds = new Set<string>();
  for (const row of durableLateSiblingRows) {
    if (!reconciliationImpliesLateSiblingAfterFinalization(row)) continue;
    noteIrreversibleOwner({
      energyEventId: row.energyEventId,
      enrichmentEnqueuedAt: row.enrichmentEnqueuedAt,
      fuelStationEnrichment: row.energyEvent.fuelStationEnrichment,
    });
    if (row.canonicalEventId) {
      durableOwnerIds.add(row.canonicalEventId);
    }
  }

  if (durableOwnerIds.size > 0) {
    const ownerRows = await prisma.vehicleEnergyEventRefuelReconciliation.findMany({
      where: { vehicleId: params.vehicleId, energyEventId: { in: [...durableOwnerIds] } },
      include: {
        energyEvent: { include: { fuelStationEnrichment: true } },
      },
    });
    for (const owner of ownerRows) {
      priorFinalRowsById[owner.energyEventId] = vehicleEnergyEventToRefuelRow(owner.energyEvent);
      if (owner.finalityState === PhysicalRefuelFinalityState.FINAL_DISTINCT) {
        priorDistinctFinalizationIds.add(owner.energyEventId);
      } else {
        priorCanonicalFinalizationIds.add(owner.energyEventId);
      }
      noteIrreversibleOwner({
        energyEventId: owner.energyEventId,
        enrichmentEnqueuedAt: owner.enrichmentEnqueuedAt,
        fuelStationEnrichment: owner.energyEvent.fuelStationEnrichment,
      });
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
    irreversiblePriorFinalOwnerIds,
  };
}

/**
 * F10.6.8-A — reconstruct prior-final owner ids from persisted late-sibling conflict rows
 * when mutable enrichmentEligible / FINAL_* fields were overwritten.
 */
export function extractDurablePriorFinalOwnerIdsFromLateSiblingRows(
  rows: Array<
    Pick<
      VehicleEnergyEventRefuelReconciliation,
      'canonicalEventId' | 'lateSiblingConflict' | 'reason' | 'reasonCodes'
    >
  >,
): Set<string> {
  const ownerIds = new Set<string>();
  for (const row of rows) {
    if (!reconciliationImpliesLateSiblingAfterFinalization(row)) continue;
    if (row.canonicalEventId) ownerIds.add(row.canonicalEventId);
  }
  return ownerIds;
}
