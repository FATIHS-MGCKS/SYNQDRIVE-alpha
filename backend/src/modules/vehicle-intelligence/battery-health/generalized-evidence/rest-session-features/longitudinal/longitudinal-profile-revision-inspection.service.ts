import { Injectable } from '@nestjs/common';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';

export type LongitudinalProfileRevisionInspectRequest = {
  revisionId: string;
};

export type LongitudinalProfileRevisionInspectOutcome =
  | { status: 'NOT_FOUND' }
  | {
      status: 'OK';
      revision: Awaited<
        ReturnType<LongitudinalProfileMaterializationRepository['findById']>
      >;
    };

/**
 * M3.3F F4.1 D4 — read-only D3 revision inspection (ops / evidence; no customer HTTP).
 */
@Injectable()
export class LongitudinalProfileRevisionInspectionService {
  constructor(
    private readonly materializationRepository: LongitudinalProfileMaterializationRepository,
  ) {}

  async inspectRevision(
    request: LongitudinalProfileRevisionInspectRequest,
  ): Promise<LongitudinalProfileRevisionInspectOutcome> {
    const revision = await this.materializationRepository.findById(request.revisionId);
    if (!revision) {
      return { status: 'NOT_FOUND' };
    }
    return { status: 'OK', revision };
  }
}
