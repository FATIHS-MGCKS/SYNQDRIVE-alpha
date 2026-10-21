import type { PrismaClient } from '@prisma/client';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4TransitionRejectedError } from '../s4a-foundation/di-v0-s4a-errors';
import { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import { DI_V0_S4E_TUNING, isDiV0S4eMaintenanceConfigured } from './di-v0-s4e-config';
import { listDiV0S4RetiredPipelineVersionKeys } from './di-v0-s4e-retired-pipeline-keys';

export interface DiV0S4T12PipelineRetireResult {
  pipelineVersionKey: string;
  supersededWorkItemIds: string[];
  noWork: boolean;
}

export interface DiV0S4MaintenancePassResult {
  configured: boolean;
  t10ReapedWorkItemIds: string[];
  t10NoWork: boolean;
  t12Results: DiV0S4T12PipelineRetireResult[];
  retiredPipelinesConsidered: number;
}

/**
 * Dormant S4E maintenance: invokes repository T10/T12 only (no duplicate SQL).
 */
export class DiV0S4MaintenanceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: DiV0S4WorkItemRepository,
    private readonly config: DiV0S4ControlPlaneConfig,
  ) {}

  isConfigured(): boolean {
    return isDiV0S4eMaintenanceConfigured(this.config);
  }

  async runMaintenancePass(input?: {
    t10Limit?: number;
    t12PipelineLimit?: number;
    t12PerPipelineLimit?: number;
  }): Promise<DiV0S4MaintenancePassResult> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        t10ReapedWorkItemIds: [],
        t10NoWork: true,
        t12Results: [],
        retiredPipelinesConsidered: 0,
      };
    }

    const t10Limit = Math.max(
      1,
      Math.min(input?.t10Limit ?? DI_V0_S4E_TUNING.t10BatchLimit, DI_V0_S4E_TUNING.maxBatchLimit),
    );
    const t12PipelineLimit = Math.max(
      1,
      Math.min(input?.t12PipelineLimit ?? DI_V0_S4E_TUNING.t12MaxPipelinesPerTick, DI_V0_S4E_TUNING.maxRetiredPipelineKeysPerRead),
    );
    const t12PerPipelineLimit = Math.max(
      1,
      Math.min(input?.t12PerPipelineLimit ?? DI_V0_S4E_TUNING.t12BatchLimitPerPipeline, DI_V0_S4E_TUNING.maxBatchLimit),
    );

    let t10ReapedWorkItemIds: string[] = [];
    let t10NoWork = false;
    try {
      t10ReapedWorkItemIds = await this.repository.reapExhausted({ limit: t10Limit });
    } catch (error) {
      if (error instanceof DiV0S4TransitionRejectedError && error.code === 'NO_EXHAUSTED_WORK_ITEM') {
        t10NoWork = true;
      } else {
        throw error;
      }
    }

    const retiredKeys = await listDiV0S4RetiredPipelineVersionKeys(this.prisma, t12PipelineLimit);
    const t12Results: DiV0S4T12PipelineRetireResult[] = [];
    for (const pipelineVersionKey of retiredKeys) {
      try {
        const supersededWorkItemIds = await this.repository.retirePipelineItems({
          pipelineVersionKey,
          limit: t12PerPipelineLimit,
        });
        t12Results.push({ pipelineVersionKey, supersededWorkItemIds, noWork: false });
      } catch (error) {
        if (error instanceof DiV0S4TransitionRejectedError && error.code === 'NO_RETIRABLE_WORK_ITEM') {
          t12Results.push({ pipelineVersionKey, supersededWorkItemIds: [], noWork: true });
          continue;
        }
        throw error;
      }
    }

    return {
      configured: true,
      t10ReapedWorkItemIds,
      t10NoWork,
      t12Results,
      retiredPipelinesConsidered: retiredKeys.length,
    };
  }
}
