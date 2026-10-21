import type { HvChargeSession } from '@prisma/client';
import { M3_3HvH4ChargeSessionEvidenceMaterializationRepository } from './m3-3-hv-h4-a3-charge-session-evidence-materialization.repository';
import { buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.mapper.v1';
import type { M3_3HvH4ChargeSessionEvidencePersistOutcomeV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.types.v1';

/** Internal/test-callable A3.2 writer — not registered for automatic runtime execution. */
export class M3_3HvH4ChargeSessionEvidenceWriterService {
  constructor(
    private readonly repository: M3_3HvH4ChargeSessionEvidenceMaterializationRepository,
  ) {}

  persistFromHvChargeSession(
    session: HvChargeSession,
  ): Promise<M3_3HvH4ChargeSessionEvidencePersistOutcomeV1> {
    const input = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(session);
    return this.repository.persistIdempotent(input);
  }
}

export function createM3_3HvH4ChargeSessionEvidenceWriterService(
  db: ConstructorParameters<typeof M3_3HvH4ChargeSessionEvidenceMaterializationRepository>[0],
): M3_3HvH4ChargeSessionEvidenceWriterService {
  return new M3_3HvH4ChargeSessionEvidenceWriterService(
    new M3_3HvH4ChargeSessionEvidenceMaterializationRepository(db),
  );
}
