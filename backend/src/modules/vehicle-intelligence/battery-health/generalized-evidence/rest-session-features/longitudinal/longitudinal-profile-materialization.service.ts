import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { LongitudinalSourceEvidenceAckRepository } from './longitudinal-source-evidence-ack.repository';
import type {
  LongitudinalProfileMaterializationOutcome,
  LongitudinalProfileMaterializationRequest,
} from './longitudinal-profile-materialization.types';
import type { LongitudinalInputReaderService } from './longitudinal-input.reader';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { recordLongitudinalReconciliationAckOutcome } from './longitudinal-reconciliation.metrics';

/**
 * M3.3D D3 foundation — scientific materialization orchestration (Nest-registered in M3.3F F1; callers must use gated runtime facade).
 */
export class LongitudinalProfileMaterializationService {
  constructor(
    private readonly inputReader: LongitudinalInputReaderService,
    private readonly materializationRepository: LongitudinalProfileMaterializationRepository,
    private readonly sourceEvidenceAckRepository: LongitudinalSourceEvidenceAckRepository,
    private readonly metrics?: TripMetricsService,
  ) {}

  async materialize(
    request: LongitudinalProfileMaterializationRequest,
  ): Promise<LongitudinalProfileMaterializationOutcome> {
    const inventoryOutcome = await this.inputReader.readInventory({
      organizationId: request.organizationId,
      vehicleId: request.vehicleId,
      sessionLimit: request.sessionLimit,
    });

    if (inventoryOutcome.status === 'REJECTED') {
      return { outcome: 'D1_REJECTED', reason: inventoryOutcome.reason };
    }

    const assemblyOutcome = assembleLongitudinalProfileV1({
      inventory: inventoryOutcome.result,
      profileGeneratedAt: request.profileGeneratedAt,
    });

    if (assemblyOutcome.status === 'REJECTED') {
      return { outcome: 'D2_REJECTED', reason: assemblyOutcome.reason };
    }

    const fingerprint = computeLongitudinalScientificProfileFingerprintV1(
      assemblyOutcome.profile,
    );
    const persistenceInput = buildLongitudinalProfileMaterializationPersistenceInput(
      fingerprint,
      inventoryOutcome.result.sourceEvidenceFingerprint,
    );

    const insertOutcome = await this.materializationRepository.insertIdempotent(
      persistenceInput,
    );

    if (
      insertOutcome.persistenceOutcome === 'CREATED' ||
      insertOutcome.persistenceOutcome === 'EXISTING'
    ) {
      const ackOutcome = await this.sourceEvidenceAckRepository.acknowledgeSourceEvidence({
        organizationId: request.organizationId,
        vehicleId: request.vehicleId,
        sourceEvidenceFingerprint: inventoryOutcome.result.sourceEvidenceFingerprint,
        longitudinalProfileContractVersion:
          insertOutcome.revision.longitudinalProfileContractVersion,
        profilePolicyVersion: insertOutcome.revision.profilePolicyVersion,
        canonicalProfileFingerprint: insertOutcome.revision.canonicalProfileFingerprint,
        revisionId: insertOutcome.revision.id,
        materializationOutcome: insertOutcome.persistenceOutcome,
      });
      recordLongitudinalReconciliationAckOutcome(this.metrics, ackOutcome);
    }

    return {
      outcome: insertOutcome.persistenceOutcome,
      revisionId: insertOutcome.revision.id,
      canonicalProfileFingerprint: insertOutcome.revision.canonicalProfileFingerprint,
      longitudinalProfileContractVersion:
        insertOutcome.revision.longitudinalProfileContractVersion,
      profilePolicyVersion: insertOutcome.revision.profilePolicyVersion,
      revision: insertOutcome.revision,
    };
  }
}
