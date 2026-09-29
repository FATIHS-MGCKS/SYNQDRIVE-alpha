import { DiV0S4TransitionRejectedError } from '../../s4a-foundation/di-v0-s4a-errors';
import type { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4MaintenanceService } from '../di-v0-s4e-maintenance.service';

describe('DiV0S4MaintenanceService (unit)', () => {
  const config = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
  const offConfig = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'false' });

  function service(repo: Pick<DiV0S4WorkItemRepository, 'reapExhausted' | 'retirePipelineItems'>) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as never;
    return new DiV0S4MaintenanceService(prisma, repo as DiV0S4WorkItemRepository, config);
  }

  it('S4E2-U01 master off — configured false, no repository calls', async () => {
    const reap = jest.fn();
    const svc = new DiV0S4MaintenanceService({} as never, { reapExhausted: reap } as never, offConfig);
    const pass = await svc.runMaintenancePass();
    expect(pass.configured).toBe(false);
    expect(reap).not.toHaveBeenCalled();
  });

  it('S4E2-U02 NO_EXHAUSTED_WORK_ITEM — clean no-op', async () => {
    const repo = {
      reapExhausted: jest.fn().mockRejectedValue(new DiV0S4TransitionRejectedError('T10_EXHAUST', 'NO_EXHAUSTED_WORK_ITEM')),
      retirePipelineItems: jest.fn(),
    };
    const pass = await service(repo).runMaintenancePass();
    expect(pass.t10NoWork).toBe(true);
    expect(pass.t10ReapedWorkItemIds).toEqual([]);
  });

  it('S4E2-U03 NO_RETIRABLE_WORK_ITEM per pipeline — recorded as noWork', async () => {
    const repo = {
      reapExhausted: jest.fn().mockResolvedValue([]),
      retirePipelineItems: jest.fn().mockRejectedValue(new DiV0S4TransitionRejectedError('T12_RETIRE', 'NO_RETIRABLE_WORK_ITEM')),
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ pipeline_version_key: 'pv-retired' }]),
    } as never;
    const pass = await new DiV0S4MaintenanceService(prisma, repo as never, config).runMaintenancePass();
    expect(pass.t12Results).toEqual([{ pipelineVersionKey: 'pv-retired', supersededWorkItemIds: [], noWork: true }]);
  });
});
