import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type {
  VsiProfileRevisionMaterializationTrigger,
  VsiProfileRevisionSourceLinkLifecycleContextV1,
  VsiProfileRevisionSourceProvenanceV1,
} from './vsi-profile-revision-history.types';

export type VsiProfileRevisionHistoryCaptureInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  profileRevision: number;
  profileContractVersion: string;
  contentFingerprint: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  evaluatedAt: Date;
  declaredCatalogCheckedAt: Date | null;
  lastMaterializedSourceTimestamp: Date | null;
  lastMaterializedProviderFetchAt: Date | null;
  lastProvenStrictSourceAdvanceAt: Date | null;
  signalsSnapshot: unknown;
  profileLimitations: string[];
  materializationTrigger: VsiProfileRevisionMaterializationTrigger;
  sourceLinkLifecycleContext: VsiProfileRevisionSourceLinkLifecycleContextV1;
};

export function buildVsiProfileRevisionSourceProvenance(input: {
  declaredCatalogCheckedAt: Date | null;
  lastMaterializedSourceTimestamp: Date | null;
  lastMaterializedProviderFetchAt: Date | null;
  lastProvenStrictSourceAdvanceAt: Date | null;
}): VsiProfileRevisionSourceProvenanceV1 {
  return {
    version: 'vsi-profile-revision-provenance-v1',
    declaredCatalogCheckedAt: input.declaredCatalogCheckedAt?.toISOString() ?? null,
    lastMaterializedSourceTimestamp: input.lastMaterializedSourceTimestamp?.toISOString() ?? null,
    lastMaterializedProviderFetchAt: input.lastMaterializedProviderFetchAt?.toISOString() ?? null,
    lastProvenStrictSourceAdvanceAt: input.lastProvenStrictSourceAdvanceAt?.toISOString() ?? null,
  };
}

/**
 * Append exactly one immutable row for the committed profile revision (same transaction as mutable profile).
 * `recorded_at` is database-defaulted and must not be backdated from application code.
 */
export async function appendVsiProfileRevisionHistoryInTransaction(
  tx: Prisma.TransactionClient,
  input: VsiProfileRevisionHistoryCaptureInput,
): Promise<void> {
  const sourceProvenance = buildVsiProfileRevisionSourceProvenance({
    declaredCatalogCheckedAt: input.declaredCatalogCheckedAt,
    lastMaterializedSourceTimestamp: input.lastMaterializedSourceTimestamp,
    lastMaterializedProviderFetchAt: input.lastMaterializedProviderFetchAt,
    lastProvenStrictSourceAdvanceAt: input.lastProvenStrictSourceAdvanceAt,
  });

  await tx.vehicleSignalCapabilityProfileRevision.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      profileRevision: input.profileRevision,
      profileContractVersion: input.profileContractVersion,
      contentFingerprint: input.contentFingerprint,
      providerIdentity: input.providerIdentity,
      verifiedModality: input.verifiedModality,
      telemetrySourceFamily: input.telemetrySourceFamily,
      evaluatedAt: input.evaluatedAt,
      declaredCatalogCheckedAt: input.declaredCatalogCheckedAt,
      lastMaterializedSourceTimestamp: input.lastMaterializedSourceTimestamp,
      lastMaterializedProviderFetchAt: input.lastMaterializedProviderFetchAt,
      lastProvenStrictSourceAdvanceAt: input.lastProvenStrictSourceAdvanceAt,
      signalsSnapshot: input.signalsSnapshot as Prisma.InputJsonValue,
      profileLimitations: input.profileLimitations as Prisma.InputJsonValue,
      materializationTrigger: input.materializationTrigger,
      sourceLinkLifecycleContext: input.sourceLinkLifecycleContext as Prisma.InputJsonValue,
      sourceProvenance: sourceProvenance as Prisma.InputJsonValue,
    },
  });
}
