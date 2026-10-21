import type { PrismaClient } from '@prisma/client';
import { loadM3_3HvH4NonChargeSessionDataV1 } from './m3-3-hv-h4-data.loader';
import { M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 } from './m3-3-hv-h4-a3.constants';
import { collapseModeAEffectiveRevisionsV1 } from './m3-3-hv-h4-a3-mode-a-effective-revision.v1';
import {
  reconstructM3_3HvH4ChargeSessionScientificRowFromRevisionV1,
  verifyDurableEvidenceRevisionForModeALoaderV1,
} from './m3-3-hv-h4-a3-durable-revision-reconstruction.v1';
import { applyM3_3HvH4ChargeSessionSourcePopulationV1 } from './m3-3-hv-h4-charge-session-source-population.v1';
import type { M3_3HvH4ChargeSessionScientificRowV1 } from './m3-3-hv-h4-charge-session-scientific-row.v1';
import type { M3_3HvH4LoadedDataV1 } from './m3-3-hv-h4-loaded-data.types';
import type { HvH4ReadOnlyTx } from './m3-3-hv-h4-readonly-transaction';

export interface M3_3HvH4DurableModeAChargeSessionLoadV1 {
  chargeSessions: M3_3HvH4ChargeSessionScientificRowV1[];
  chargeSessionSourceLoad: {
    loadedCount: number;
    hardLimit: number;
    sourceTruncated: boolean;
    hardLimitReached: boolean;
  };
}

export async function loadM3_3HvH4DurableModeAChargeSessionsV1(
  tx: HvH4ReadOnlyTx,
  input: {
    organizationId: string;
    vehicleId: string;
    evaluationAt: Date;
    evidenceContractVersion?: string;
  },
): Promise<M3_3HvH4DurableModeAChargeSessionLoadV1> {
  const evidenceContractVersion =
    input.evidenceContractVersion ?? M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1;

  const revisions = await tx.batteryHvChargeSessionEvidenceRevision.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      evidenceContractVersion,
    },
  });

  if (revisions.length === 0) {
    const empty = applyM3_3HvH4ChargeSessionSourcePopulationV1({
      sessions: [],
      evaluationAt: input.evaluationAt,
    });
    return {
      chargeSessions: empty.sessions,
      chargeSessionSourceLoad: empty.sourceLoad,
    };
  }

  const revisionIds = revisions.map((r) => r.id);
  const acks = await tx.batteryHvChargeSessionEvidenceAck.findMany({
    where: { revisionId: { in: revisionIds } },
  });
  const ackByRevisionId = new Map(acks.map((a) => [a.revisionId, a]));

  for (const revision of revisions) {
    verifyDurableEvidenceRevisionForModeALoaderV1({
      revision,
      ack: ackByRevisionId.get(revision.id),
    });
  }

  const effectiveRevisions = collapseModeAEffectiveRevisionsV1(revisions);
  const reconstructed = effectiveRevisions.map((r) =>
    reconstructM3_3HvH4ChargeSessionScientificRowFromRevisionV1(r),
  );

  const populated = applyM3_3HvH4ChargeSessionSourcePopulationV1({
    sessions: reconstructed,
    evaluationAt: input.evaluationAt,
  });
  return {
    chargeSessions: populated.sessions,
    chargeSessionSourceLoad: populated.sourceLoad,
  };
}

export async function loadM3_3HvH4DataFromDurableRevisionsModeAV1(
  tx: HvH4ReadOnlyTx,
  input: {
    organizationId: string;
    vehicleId: string;
    evaluationAt: Date;
  },
): Promise<M3_3HvH4LoadedDataV1> {
  const durableCharge = await loadM3_3HvH4DurableModeAChargeSessionsV1(tx, input);
  const rest = await loadM3_3HvH4NonChargeSessionDataV1(
    tx,
    input.organizationId,
    input.vehicleId,
    input.evaluationAt,
  );
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    evaluationAt: input.evaluationAt,
    chargeSessions: durableCharge.chargeSessions,
    chargeSessionSourceLoad: durableCharge.chargeSessionSourceLoad,
    ...rest,
  };
}

export type M3_3HvH4DurableModeALoaderDeps = {
  prisma: PrismaClient;
};
