import { Injectable } from '@nestjs/common';
import type { BatteryLongitudinalProfileRevision } from '@prisma/client';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { LongitudinalSourceEvidenceAckRepository } from './longitudinal-source-evidence-ack.repository';

export type LongitudinalProfileRevisionInspectRequest = {
  revisionId: string;
};

export type LongitudinalProfileRevisionAckSummary = {
  sourceEvidenceFingerprint: string;
  longitudinalProfileContractVersion: string;
  profilePolicyVersion: string;
  materializationOutcome: string;
  acknowledgedAt: string;
};

export type LongitudinalProfileRevisionInspectView = {
  revision: BatteryLongitudinalProfileRevision;
  /** Immutable D1 fingerprint stored on the revision row at creation — not the live freshness fence. */
  creationSourceEvidenceFingerprint: string | null;
  creationSourceEvidenceFingerprintAuthority: 'NON_AUTHORITATIVE_CREATION_PROVENANCE';
  sourceEvidenceAcknowledgements: LongitudinalProfileRevisionAckSummary[];
  ackCount: number;
};

export type LongitudinalProfileRevisionInspectOutcome =
  | { status: 'NOT_FOUND' }
  | {
      status: 'OK';
      view: LongitudinalProfileRevisionInspectView;
    };

/**
 * M3.3F F4.1 D4 — read-only D3 revision inspection (ops / evidence; no customer HTTP).
 */
@Injectable()
export class LongitudinalProfileRevisionInspectionService {
  constructor(
    private readonly materializationRepository: LongitudinalProfileMaterializationRepository,
    private readonly sourceEvidenceAckRepository: LongitudinalSourceEvidenceAckRepository,
  ) {}

  async inspectRevision(
    request: LongitudinalProfileRevisionInspectRequest,
  ): Promise<LongitudinalProfileRevisionInspectOutcome> {
    const revision = await this.materializationRepository.findById(request.revisionId);
    if (!revision) {
      return { status: 'NOT_FOUND' };
    }

    const ackRows = await this.sourceEvidenceAckRepository.listAcknowledgementsForRevision(
      revision.id,
    );

    return {
      status: 'OK',
      view: {
        revision,
        creationSourceEvidenceFingerprint: revision.sourceEvidenceFingerprint,
        creationSourceEvidenceFingerprintAuthority: 'NON_AUTHORITATIVE_CREATION_PROVENANCE',
        sourceEvidenceAcknowledgements: ackRows.map((row) => ({
          sourceEvidenceFingerprint: row.sourceEvidenceFingerprint,
          longitudinalProfileContractVersion: row.longitudinalProfileContractVersion,
          profilePolicyVersion: row.profilePolicyVersion,
          materializationOutcome: row.materializationOutcome,
          acknowledgedAt: row.acknowledgedAt.toISOString(),
        })),
        ackCount: ackRows.length,
      },
    };
  }
}
