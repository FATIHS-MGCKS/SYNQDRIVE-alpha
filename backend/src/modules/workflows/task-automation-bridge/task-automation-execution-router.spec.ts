import { ConfigService } from '@nestjs/config';
import { TaskAutomationExecutionRouterService } from './task-automation-execution-router.service';
import type { TaskAutomationExecutionRouteInput } from './task-automation-workflow-bridge.types';

describe('TaskAutomationExecutionRouterService — runtime modes', () => {
  const legacyExecute = jest.fn().mockResolvedValue(undefined);
  const materializer = {
    materializeViaWorkflow: jest.fn().mockResolvedValue({
      shadow: {
        catalogKey: 'BOOKING_PREPARATION',
        previewSummary: 'Would create task',
        dedupKey: 'booking:prep:b1',
      },
    }),
  };

  function buildRouter(mode: 'legacy' | 'shadow' | 'cutover') {
    const config = {
      get: jest.fn().mockReturnValue(mode),
    } as unknown as ConfigService;
    return new TaskAutomationExecutionRouterService(materializer as any, config);
  }

  const input: TaskAutomationExecutionRouteInput = {
    payload: {
      organizationId: 'org-shadow',
      catalogKey: 'BOOKING_PREPARATION',
      ruleId: 'booking.lifecycle.confirmed.prep',
      dedupKey: 'booking:prep:b1',
      title: 'Prep',
      priority: 'NORMAL',
      type: 'CUSTOM',
      sourceType: 'SYSTEM',
      source: 'TASK_AUTOMATION',
    },
    legacyExecute,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('legacy mode executes legacy path only', async () => {
    const router = buildRouter('legacy');
    await router.route(input);
    expect(legacyExecute).toHaveBeenCalledTimes(1);
    expect(materializer.materializeViaWorkflow).not.toHaveBeenCalled();
  });

  it('shadow mode executes legacy + preview without workflow write', async () => {
    const router = buildRouter('shadow');
    await router.route(input);
    expect(legacyExecute).toHaveBeenCalledTimes(1);
    expect(materializer.materializeViaWorkflow).toHaveBeenCalledWith(
      input.payload,
      'preview',
    );
    const drained = router.drainShadowLog();
    expect(drained).toHaveLength(1);
    expect(drained[0].previewSummary).toContain('Would create');
  });

  it('cutover mode skips legacy and executes workflow materialization', async () => {
    const router = buildRouter('cutover');
    await router.route(input);
    expect(legacyExecute).not.toHaveBeenCalled();
    expect(materializer.materializeViaWorkflow).toHaveBeenCalledWith(
      input.payload,
      'execute',
    );
  });

  it('shadow log drains atomically (no duplicate replay)', async () => {
    const router = buildRouter('shadow');
    await router.route(input);
    expect(router.drainShadowLog()).toHaveLength(1);
    expect(router.drainShadowLog()).toHaveLength(0);
  });
});
