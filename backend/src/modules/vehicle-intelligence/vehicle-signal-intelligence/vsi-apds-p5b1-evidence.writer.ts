import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { isVsiP5b1EvidenceStoreWriteEnabled } from './vsi-apds-p5b1.config';
import { buildP5b1CorrelationEvidenceFingerprint } from './vsi-apds-p5b1-evidence-fingerprint';
import { VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';

export type VsiApdsP5b1EvidenceAppendResult =
  | { attempted: false; appended: 0; reason: 'RUNTIME_DISABLED' }
  | { attempted: true; appended: 0; reason: 'DUPLICATE_FINGERPRINT' }
  | { attempted: true; appended: 1; reason: 'APPENDED' | 'NEW_REVISION' }
  | { attempted: true; appended: 0; reason: 'REVISION_CONFLICT_RETRY_EXHAUSTED' };

const MAX_REVISION_RETRIES = 3;

@Injectable()
export class VsiApdsP5b1EvidenceWriter {
  constructor(private readonly prisma: PrismaService) {}

  async appendCorrelationEvidence(input: {
    replayRunId: string;
    row: VsiApdsP5b1OfflineCorrelationRowV1;
  }): Promise<VsiApdsP5b1EvidenceAppendResult> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!isVsiP5b1EvidenceStoreWriteEnabled(databaseUrl)) {
      return { attempted: false, appended: 0, reason: 'RUNTIME_DISABLED' };
    }

    const fingerprint = buildP5b1CorrelationEvidenceFingerprint(input.row);
    const identity = input.row.decisionIdentity;

    for (let attempt = 0; attempt < MAX_REVISION_RETRIES; attempt += 1) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const duplicate = await tx.vsiApdsP5CorrelationEvidence.findFirst({
            where: {
              organizationId: identity.organizationId,
              vehicleId: identity.vehicleId,
              opportunityId: identity.opportunityId,
              policyVersion: identity.policyVersion,
              decisionAt: new Date(identity.decisionAt),
              p5CorrelationContractVersion: VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION,
              correlationFingerprint: fingerprint,
            },
            select: { id: true },
          });
          if (duplicate) {
            return { appended: 0 as const, reason: 'DUPLICATE_FINGERPRINT' as const };
          }

          const latest = await tx.vsiApdsP5CorrelationEvidence.findFirst({
            where: {
              organizationId: identity.organizationId,
              vehicleId: identity.vehicleId,
              opportunityId: identity.opportunityId,
              policyVersion: identity.policyVersion,
              decisionAt: new Date(identity.decisionAt),
              p5CorrelationContractVersion: VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION,
            },
            orderBy: { evidenceRevision: 'desc' },
            select: { evidenceRevision: true, correlationFingerprint: true },
          });

          const nextRevision = (latest?.evidenceRevision ?? 0) + 1;
          const reason =
            latest && latest.correlationFingerprint !== fingerprint
              ? ('NEW_REVISION' as const)
              : ('APPENDED' as const);

          await tx.vsiApdsP5CorrelationEvidence.create({
            data: {
              organizationId: identity.organizationId,
              vehicleId: identity.vehicleId,
              providerSourceLinkId: input.row.sourceLinkAttribution.providerSourceLinkId,
              opportunityId: identity.opportunityId,
              policyVersion: identity.policyVersion,
              activationEpochId: identity.activationEpochId,
              shadowExecutionVersion: identity.shadowExecutionVersion,
              decisionAt: new Date(identity.decisionAt),
              p5CorrelationContractVersion: VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION,
              correlationFingerprint: fingerprint,
              evidenceRevision: nextRevision,
              replayRunId: input.replayRunId,
              payloadJson: input.row as object,
            },
          });

          return { appended: 1 as const, reason };
        });

        if (result.appended === 0) {
          return { attempted: true, appended: 0, reason: 'DUPLICATE_FINGERPRINT' };
        }
        return { attempted: true, appended: 1, reason: result.reason };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    return { attempted: true, appended: 0, reason: 'REVISION_CONFLICT_RETRY_EXHAUSTED' };
  }
}
