import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { isVsiP5b1EvidenceStoreWriteEnabled } from './vsi-apds-p5b1.config';
import { buildP5b1CorrelationEvidenceFingerprint } from './vsi-apds-p5b1-evidence-fingerprint';
import { VSI_APDS_P5B1_EVIDENCE_STORE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';

export type VsiApdsP5b1EvidenceAppendResult =
  | { attempted: false; appended: 0; reason: 'RUNTIME_DISABLED' }
  | { attempted: true; appended: 0; reason: 'DUPLICATE_FINGERPRINT' }
  | { attempted: true; appended: 1; reason: 'APPENDED' | 'NEW_REVISION' };

@Injectable()
export class VsiApdsP5b1EvidenceWriter {
  constructor(private readonly prisma: PrismaService) {}

  async appendCorrelationEvidence(input: {
    replayRunId: string;
    row: VsiApdsP5b1OfflineCorrelationRowV1;
  }): Promise<VsiApdsP5b1EvidenceAppendResult> {
    if (!isVsiP5b1EvidenceStoreWriteEnabled()) {
      return { attempted: false, appended: 0, reason: 'RUNTIME_DISABLED' };
    }

    const fingerprint = buildP5b1CorrelationEvidenceFingerprint(input.row);
    const identity = input.row.decisionIdentity;

    const existing = await this.prisma.vsiApdsP5CorrelationEvidence.findFirst({
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
    if (existing) {
      return { attempted: true, appended: 0, reason: 'DUPLICATE_FINGERPRINT' };
    }

    const latest = await this.prisma.vsiApdsP5CorrelationEvidence.findFirst({
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
      latest && latest.correlationFingerprint !== fingerprint ? 'NEW_REVISION' : 'APPENDED';

    await this.prisma.vsiApdsP5CorrelationEvidence.create({
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

    return { attempted: true, appended: 1, reason };
  }
}
