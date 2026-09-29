import type { PrismaClient } from '@prisma/client';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4TransitionRejectedError } from '../s4a-foundation/di-v0-s4a-errors';
import { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import {
  classifyDriftSupersedeReason,
  listDiV0S4DriftWatchCandidates,
  scopeCorruptionForCandidate,
  type DiV0S4DriftScopeCorruptionCode,
} from './di-v0-s4e-drift-candidates';
import { DI_V0_S4E_TUNING, isDiV0S4DriftWatcherConfigured } from './di-v0-s4e-config';

export interface DiV0S4DriftWatchPassResult {
  configured: boolean;
  scanned: number;
  unchanged: number;
  superseded: number;
  scopeCorruption: number;
  rejected: number;
  scopeCorruptionCodes: DiV0S4DriftScopeCorruptionCode[];
}

/**
 * Dormant S4E drift watcher: read candidates, re-hash canonical boundary, invoke repository T11 only.
 * No canonical trip writes, no provider calls, no alternate supersession path.
 */
export class DiV0S4DriftWatcherService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: DiV0S4WorkItemRepository,
    private readonly config: DiV0S4ControlPlaneConfig,
    private readonly batchLimit: number = DI_V0_S4E_TUNING.defaultBatchLimit,
  ) {}

  isConfigured(): boolean {
    return isDiV0S4DriftWatcherConfigured(this.config);
  }

  async runDriftWatchPass(limit?: number): Promise<DiV0S4DriftWatchPassResult> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        scanned: 0,
        unchanged: 0,
        superseded: 0,
        scopeCorruption: 0,
        rejected: 0,
        scopeCorruptionCodes: [],
      };
    }

    const candidates = await listDiV0S4DriftWatchCandidates(this.prisma, limit ?? this.batchLimit);
    let unchanged = 0;
    let superseded = 0;
    let scopeCorruption = 0;
    let rejected = 0;
    const scopeCorruptionCodes: DiV0S4DriftScopeCorruptionCode[] = [];

    for (const candidate of candidates) {
      const corruption = scopeCorruptionForCandidate(candidate, candidate.tripVehicleId);
      if (corruption) {
        scopeCorruption += 1;
        scopeCorruptionCodes.push(corruption);
        continue;
      }

      if (candidate.canonicalFingerprint === candidate.storedFingerprint) {
        unchanged += 1;
        continue;
      }

      const supersedeReason = classifyDriftSupersedeReason(candidate.tripStatus);

      try {
        await this.repository.supersedeOnDrift({ workItemId: candidate.workItemId, reason: supersedeReason });
        superseded += 1;
      } catch (error) {
        if (error instanceof DiV0S4TransitionRejectedError) {
          if (error.code === 'BOUNDARY_FINGERPRINT_UNCHANGED') {
            unchanged += 1;
            continue;
          }
          rejected += 1;
          continue;
        }
        throw error;
      }
    }

    return {
      configured: true,
      scanned: candidates.length,
      unchanged,
      superseded,
      scopeCorruption,
      rejected,
      scopeCorruptionCodes,
    };
  }
}
