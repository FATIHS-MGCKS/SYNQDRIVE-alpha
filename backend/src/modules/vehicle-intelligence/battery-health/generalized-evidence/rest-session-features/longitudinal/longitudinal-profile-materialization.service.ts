import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { computeLongitudinalScientificProfileFingerprintV1 } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import type {
  LongitudinalProfileMaterializationOutcome,
  LongitudinalProfileMaterializationRequest,
} from './longitudinal-profile-materialization.types';
import type { LongitudinalInputReaderService } from './longitudinal-input.reader';

/**
 * M3.3D D3 foundation — internal only; not registered in Nest modules until M3.3F.
 */
export class LongitudinalProfileMaterializationService {
  constructor(
    private readonly inputReader: LongitudinalInputReaderService,
    private readonly materializationRepository: LongitudinalProfileMaterializationRepository,
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
    const persistenceInput = buildLongitudinalProfileMaterializationPersistenceInput(fingerprint);

    const insertOutcome = await this.materializationRepository.insertIdempotent(
      persistenceInput,
    );

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
