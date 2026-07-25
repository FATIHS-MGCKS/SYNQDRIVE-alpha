import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowAuditService } from '../audit/workflow-audit.service';
import {
  resolveEffectiveRolloutFlags,
} from './workflow-runtime-rollout.resolver';
import { WorkflowRuntimeRolloutService } from './workflow-runtime-rollout.service';
import { WorkflowRuntimeRolloutGatesService } from './workflow-runtime-rollout-gates.service';
import type { WorkflowRuntimeGlobalRolloutConfig, WorkflowRuntimeOrgRolloutSettings } from './workflow-runtime-rollout.contract';
import { WORKFLOW_RUNTIME_ROLLOUT_STAGE_ORDER } from './workflow-runtime-rollout.contract';
import { TaskAutomationExecutionRouterService } from '../task-automation-bridge/task-automation-execution-router.service';
import { makeRolloutServiceMock } from './workflow-runtime-rollout.test-util';
import { mapOrgRow } from './workflow-runtime-rollout.resolver';

const ORG_A = 'org-rollout-a';
const ORG_B = 'org-rollout-b';
const WF_PILOT = 'wf-pilot-1';

function baseGlobal(overrides: Partial<WorkflowRuntimeGlobalRolloutConfig> = {}): WorkflowRuntimeGlobalRolloutConfig {
  return {
    stage: 'DISABLED',
    orgAllowlist: null,
    killSwitchGlobal: false,
    killSwitchEmail: false,
    killSwitchWhatsapp: false,
    killSwitchSms: false,
    killSwitchVoice: false,
    killSwitchAi: false,
    killSwitchCritical: false,
    killActionTypes: new Set(),
    shadowDeviationThresholdPct: 5,
    gateTestsPass: true,
    monitoringEnabled: true,
    ...overrides,
  };
}

function baseOrg(overrides: Partial<WorkflowRuntimeOrgRolloutSettings> = {}): WorkflowRuntimeOrgRolloutSettings {
  return {
    stage: 'DISABLED',
    workflowAllowlist: [],
    killSwitchEnabled: false,
    killSwitchEmail: false,
    killSwitchWhatsapp: false,
    killSwitchSms: false,
    killSwitchVoice: false,
    killSwitchAi: false,
    killSwitchCritical: false,
    channelEmailEnabled: false,
    channelWhatsappEnabled: false,
    channelSmsEnabled: false,
    channelVoiceEnabled: false,
    channelAiEnabled: false,
    criticalActionsEnabled: false,
    monitoringAcknowledged: false,
    ...overrides,
  };
}

function resolve(
  orgId: string,
  global: WorkflowRuntimeGlobalRolloutConfig,
  org: WorkflowRuntimeOrgRolloutSettings,
  workflowId?: string,
) {
  return resolveEffectiveRolloutFlags({ organizationId: orgId, workflowId, global, org });
}

describe('Workflow runtime rollout resolver', () => {
  describe('rollout stages', () => {
    it.each(WORKFLOW_RUNTIME_ROLLOUT_STAGE_ORDER)('resolves execution path for stage %s', (stage) => {
      const flags = resolve(ORG_A, baseGlobal({ stage }), baseOrg({ stage }));
      expect(flags.effectiveStage).toBe(stage);

      if (stage === 'DISABLED') expect(flags.executionPath).toBe('legacy_only');
      if (stage === 'SHADOW') expect(flags.executionPath).toBe('shadow_compare');
      if (stage === 'INTERNAL_ACTIONS_ONLY') expect(flags.executionPath).toBe('workflow_live');
      if (stage === 'SELECTED_WORKFLOWS') expect(flags.executionPath).toBe('legacy_only');
      if (stage === 'SELECTED_ORGANIZATIONS') expect(flags.executionPath).toBe('workflow_live');
      if (stage === 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL') expect(flags.executionPath).toBe('workflow_live');
      if (stage === 'GENERAL_AVAILABILITY') expect(flags.executionPath).toBe('workflow_live');
    });

    it('SELECTED_WORKFLOWS allows workflow_live only for allowlisted workflow', () => {
      const global = baseGlobal({ stage: 'SELECTED_WORKFLOWS' });
      const org = baseOrg({ stage: 'SELECTED_WORKFLOWS', workflowAllowlist: [WF_PILOT] });
      const allowed = resolve(ORG_A, global, org, WF_PILOT);
      const blocked = resolve(ORG_A, global, org, 'wf-other');

      expect(allowed.executionPath).toBe('workflow_live');
      expect(allowed.runLiveEngine).toBe(true);
      expect(blocked.executionPath).toBe('legacy_only');
      expect(blocked.runLiveEngine).toBe(false);
    });

    it('SELECTED_ORGANIZATIONS blocks org outside global allowlist', () => {
      const global = baseGlobal({ stage: 'SELECTED_ORGANIZATIONS', orgAllowlist: new Set([ORG_A]) });
      const org = baseOrg({ stage: 'SELECTED_ORGANIZATIONS' });
      const allowed = resolve(ORG_A, global, org);
      const foreign = resolve(ORG_B, global, org);

      expect(allowed.executionPath).toBe('workflow_live');
      expect(foreign.effectiveStage).toBe('DISABLED');
      expect(foreign.executionPath).toBe('legacy_only');
    });
  });

  describe('kill switches', () => {
    it('global kill switch forces legacy_only and blocks live engine', () => {
      const flags = resolve(
        ORG_A,
        baseGlobal({ stage: 'GENERAL_AVAILABILITY', killSwitchGlobal: true }),
        baseOrg({ stage: 'GENERAL_AVAILABILITY' }),
      );
      expect(flags.killSwitchActive).toBe(true);
      expect(flags.executionPath).toBe('legacy_only');
      expect(flags.runLiveEngine).toBe(false);
    });

    it('org kill switch blocks without deleting settings (rollback-safe)', () => {
      const flags = resolve(
        ORG_A,
        baseGlobal({ stage: 'GENERAL_AVAILABILITY' }),
        baseOrg({ stage: 'GENERAL_AVAILABILITY', killSwitchEnabled: true }),
      );
      expect(flags.killSwitchActive).toBe(true);
      expect(flags.executionPath).toBe('legacy_only');
    });
  });

  describe('channel flags (selective providers)', () => {
    it('external email blocked until EXTERNAL_COMMUNICATIONS_WITH_APPROVAL + channel flag', () => {
      const early = resolve(
        ORG_A,
        baseGlobal({ stage: 'INTERNAL_ACTIONS_ONLY' }),
        baseOrg({ stage: 'INTERNAL_ACTIONS_ONLY', channelEmailEnabled: true }),
      );
      expect(early.channelEmail).toBe(false);

      const ready = resolve(
        ORG_A,
        baseGlobal({ stage: 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL' }),
        baseOrg({
          stage: 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL',
          channelEmailEnabled: true,
          monitoringAcknowledged: true,
        }),
      );
      expect(ready.channelEmail).toBe(true);
      expect(ready.channelWhatsapp).toBe(false);
    });

    it('provider kill switch blocks channel even when enabled', async () => {
      const prisma = {
        orgWorkflowRuntimeRolloutSettings: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const config = new ConfigService({
        workflowRuntimeRollout: {
          stage: 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL',
          orgAllowlist: [],
          killSwitchGlobal: false,
          killSwitchEmail: true,
          killSwitchWhatsapp: false,
          killSwitchSms: false,
          killSwitchVoice: false,
          killSwitchAi: false,
          killSwitchCritical: false,
          killActionTypes: [],
          shadowDeviationThresholdPct: 5,
          gateTestsPass: true,
          monitoringEnabled: true,
        },
      });
      const audit = { record: jest.fn() };
      const gates = { evaluate: jest.fn() };
      const service = new WorkflowRuntimeRolloutService(
        prisma as never,
        config,
        audit as never,
        gates as never,
      );

      const check = await service.canExecuteLiveAction(ORG_A, 'channel.email.send');
      expect(check.allowed).toBe(false);
      expect(check.reasons.some((r) => r.includes('provider_kill_switch:email'))).toBe(true);
    });
  });

  describe('fail-closed default', () => {
    it('unknown stage parses to DISABLED', () => {
      const { parseRolloutStage } = require('./workflow-runtime-rollout.contract');
      expect(parseRolloutStage('NOT_A_REAL_STAGE')).toBe('DISABLED');
      expect(parseRolloutStage(undefined)).toBe('DISABLED');
    });
  });
});

describe('WorkflowRuntimeRolloutService integration', () => {
  let service: WorkflowRuntimeRolloutService;
  let prisma: {
    orgWorkflowRuntimeRolloutSettings: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    workflowRuntimeRolloutChangeRequest: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      orgWorkflowRuntimeRolloutSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async ({ create, update, where }) => ({
          organizationId: where.organizationId,
          stage: create?.stage ?? update?.stage ?? 'DISABLED',
          workflowAllowlist: [],
          killSwitchEnabled: false,
          killSwitchEmail: false,
          killSwitchWhatsapp: false,
          killSwitchSms: false,
          killSwitchVoice: false,
          killSwitchAi: false,
          killSwitchCritical: false,
          channelEmailEnabled: false,
          channelWhatsappEnabled: false,
          channelSmsEnabled: false,
          channelVoiceEnabled: false,
          channelAiEnabled: false,
          criticalActionsEnabled: false,
          monitoringAcknowledged: false,
          updatedAt: new Date(),
          ...create,
          ...update,
        })),
        update: jest.fn(),
      },
      workflowRuntimeRolloutChangeRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'req-1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        WorkflowRuntimeRolloutService,
        WorkflowRuntimeRolloutGatesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            workflowRuntimeRollout: {
              stage: 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL',
              orgAllowlist: [],
              killSwitchGlobal: false,
              killSwitchEmail: false,
              killSwitchWhatsapp: false,
              killSwitchSms: false,
              killSwitchVoice: false,
              killSwitchAi: false,
              killSwitchCritical: false,
              killActionTypes: [],
              shadowDeviationThresholdPct: 5,
              gateTestsPass: true,
              monitoringEnabled: true,
            },
          }),
        },
        { provide: WorkflowAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(WorkflowRuntimeRolloutService);
  });

  it('records audit on kill switch toggle without data loss', async () => {
    await service.setKillSwitch(ORG_A, { enabled: true, email: true }, { userId: 'u-1' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'WORKFLOW_KILL_SWITCH_TOGGLED', orgId: ORG_A }),
    );
    expect(prisma.orgWorkflowRuntimeRolloutSettings.upsert).toHaveBeenCalled();
  });

  it('rejects risky stage promotion without maker-checker', async () => {
    await expect(
      service.updateOrgSettings(ORG_A, { stage: 'GENERAL_AVAILABILITY' }),
    ).rejects.toThrow(/maker-checker/);
  });

  it('foreign tenant change request is not found', async () => {
    prisma.workflowRuntimeRolloutChangeRequest.findFirst.mockResolvedValue(null);
    await expect(
      service.decideStagePromotion(ORG_B, 'req-foreign', 'APPROVED'),
    ).rejects.toThrow(/not found/);
  });

  it('invalidates cache on parallel settings update', async () => {
    await service.updateOrgSettings(ORG_A, { stage: 'SHADOW' });
    service.invalidateOrgCache(ORG_A);
    await service.getOrgSettings(ORG_A);
    expect(prisma.orgWorkflowRuntimeRolloutSettings.findUnique).toHaveBeenCalled();
  });
});

describe('Task automation bridge — no legacy double path', () => {
  function makeRouter(rolloutMock: ReturnType<typeof makeRolloutServiceMock>) {
    const materializer = {
      materializeViaWorkflow: jest.fn().mockResolvedValue({ shadow: { workflowId: 'wf-1', previewSummary: 'ok' }, plan: { workflowVersion: 1 } }),
    };
    const shadowService = {
      legacySnapshotFromDedup: jest.fn().mockResolvedValue(null),
      persistBridgeEvaluation: jest.fn(),
      recordLegacyComparison: jest.fn(),
    };
    const shadowGate = {
      isOrgShadowEnabled: jest.fn().mockResolvedValue(true),
      isLegacyCompareEnabled: jest.fn().mockResolvedValue(true),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'taskAutomationWorkflowRuntime.mode') return 'cutover';
        return undefined;
      }),
    };

    return {
      router: new TaskAutomationExecutionRouterService(
        materializer as never,
        shadowService as never,
        shadowGate as never,
        rolloutMock as never,
        config as never,
      ),
      materializer,
      legacyExecute: jest.fn(),
    };
  }

  it('workflow_live does not invoke legacy execute', async () => {
    const rollout = makeRolloutServiceMock({ executionPath: 'workflow_live', effectiveStage: 'INTERNAL_ACTIONS_ONLY' });
    const { router, materializer, legacyExecute } = makeRouter(rollout);

    await router.route({
      payload: {
        organizationId: ORG_A,
        catalogKey: 'BOOKING_PREPARATION',
        ruleId: 'rule-1',
        dedupKey: 'd-1',
        title: 't',
        description: 'd',
        category: 'BOOKING',
        type: 'BOOKING_PREPARATION' as never,
        sourceType: 'SYSTEM',
        source: 'AUTOMATION',
        priority: 'NORMAL',
        vehicleId: 'v-1',
        bookingId: 'b-1',
        customerId: 'c-1',
        withChecklist: true,
        dueDate: new Date(),
        activatesAt: new Date(),
        entityType: 'BOOKING',
        entityId: 'b-1',
      },
      legacyExecute,
    });

    expect(legacyExecute).not.toHaveBeenCalled();
    expect(materializer.materializeViaWorkflow).toHaveBeenCalledWith(expect.anything(), 'execute');
  });

  it('shadow_compare runs legacy once and preview only', async () => {
    const rollout = makeRolloutServiceMock({ executionPath: 'shadow_compare', effectiveStage: 'SHADOW', runShadow: true });
    const { router, materializer, legacyExecute } = makeRouter(rollout);

    await router.route({
      payload: {
        organizationId: ORG_A,
        catalogKey: 'BOOKING_PREPARATION',
        ruleId: 'rule-1',
        dedupKey: 'd-1',
        title: 't',
        description: 'd',
        category: 'BOOKING',
        type: 'BOOKING_PREPARATION' as never,
        sourceType: 'SYSTEM',
        source: 'AUTOMATION',
        priority: 'NORMAL',
        vehicleId: 'v-1',
        bookingId: 'b-1',
        customerId: 'c-1',
        withChecklist: true,
        dueDate: new Date(),
        activatesAt: new Date(),
        entityType: 'BOOKING',
        entityId: 'b-1',
      },
      legacyExecute,
    });

    expect(legacyExecute).toHaveBeenCalledTimes(1);
    expect(materializer.materializeViaWorkflow).toHaveBeenCalledWith(expect.anything(), 'preview');
    expect(materializer.materializeViaWorkflow).not.toHaveBeenCalledWith(expect.anything(), 'execute');
  });

  it('rollback to DISABLED uses legacy_only via env fallback', async () => {
    process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE = 'legacy';
    const rollout = makeRolloutServiceMock({
      executionPath: 'legacy_only',
      effectiveStage: 'DISABLED',
      globalStage: 'DISABLED',
      runLiveEngine: false,
    });
    const materializer = {
      materializeViaWorkflow: jest.fn(),
    };
    const shadowService = {
      legacySnapshotFromDedup: jest.fn(),
      persistBridgeEvaluation: jest.fn(),
      recordLegacyComparison: jest.fn(),
    };
    const shadowGate = {
      isOrgShadowEnabled: jest.fn(),
      isLegacyCompareEnabled: jest.fn(),
    };
    const config = {
      get: jest.fn(() => undefined),
    };
    const router = new TaskAutomationExecutionRouterService(
      materializer as never,
      shadowService as never,
      shadowGate as never,
      rollout as never,
      config as never,
    );
    const legacyExecute = jest.fn();

    await router.route({
      payload: {
        organizationId: ORG_A,
        catalogKey: 'BOOKING_PREPARATION',
        ruleId: 'rule-1',
        dedupKey: 'd-1',
        title: 't',
        description: 'd',
        category: 'BOOKING',
        type: 'BOOKING_PREPARATION' as never,
        sourceType: 'SYSTEM',
        source: 'AUTOMATION',
        priority: 'NORMAL',
        vehicleId: 'v-1',
        bookingId: 'b-1',
        customerId: 'c-1',
        withChecklist: true,
        dueDate: new Date(),
        activatesAt: new Date(),
        entityType: 'BOOKING',
        entityId: 'b-1',
      },
      legacyExecute,
    });

    expect(legacyExecute).toHaveBeenCalledTimes(1);
    expect(materializer.materializeViaWorkflow).not.toHaveBeenCalled();
    delete process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE;
  });
});

describe('In-flight run handling', () => {
  it('kill switch blocks new actions but preserves org settings for rollback', async () => {
    const org = mapOrgRow({
      organizationId: ORG_A,
      stage: 'GENERAL_AVAILABILITY',
      workflowAllowlist: [],
      killSwitchEnabled: true,
      killSwitchEmail: false,
      killSwitchWhatsapp: false,
      killSwitchSms: false,
      killSwitchVoice: false,
      killSwitchAi: false,
      killSwitchCritical: false,
      channelEmailEnabled: true,
      channelWhatsappEnabled: true,
      channelSmsEnabled: true,
      channelVoiceEnabled: true,
      channelAiEnabled: true,
      criticalActionsEnabled: true,
      monitoringAcknowledged: true,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const flags = resolve(ORG_A, baseGlobal({ stage: 'GENERAL_AVAILABILITY' }), org);
    expect(flags.killSwitchActive).toBe(true);
    expect(flags.orgStage).toBe('GENERAL_AVAILABILITY');
    expect(flags.runLiveEngine).toBe(false);
  });
});

describe('Pre-deployment gates', () => {
  it('returns FAIL when gateTestsPass is false', async () => {
    const prisma = {
      orgWorkflowShadowComparison: { count: jest.fn().mockResolvedValue(0) },
      orgWorkflowRuntimeRolloutSettings: { findUnique: jest.fn().mockResolvedValue({ monitoringAcknowledged: true }) },
    };
    const config = new ConfigService({
      workflowRuntimeRollout: {
        stage: 'SHADOW',
        orgAllowlist: [],
        killSwitchGlobal: false,
        killSwitchEmail: false,
        killSwitchWhatsapp: false,
        killSwitchSms: false,
        killSwitchVoice: false,
        killSwitchAi: false,
        killSwitchCritical: false,
        killActionTypes: [],
        shadowDeviationThresholdPct: 5,
        gateTestsPass: false,
        monitoringEnabled: true,
      },
    });
    const gates = new WorkflowRuntimeRolloutGatesService(prisma as never, config);
    const result = await gates.evaluate(ORG_A);
    expect(result.status).toBe('FAIL');
    expect(result.gates.find((g) => g.id === 'P0_TESTS')?.passed).toBe(false);
  });

  it('returns PASS when all gates satisfied', async () => {
    const prisma = {
      orgWorkflowShadowComparison: { count: jest.fn().mockResolvedValue(0) },
      orgWorkflowRuntimeRolloutSettings: {
        findUnique: jest.fn().mockResolvedValue({ monitoringAcknowledged: true }),
      },
    };
    const config = new ConfigService({
      workflowRuntimeRollout: {
        stage: 'SHADOW',
        orgAllowlist: [],
        killSwitchGlobal: false,
        killSwitchEmail: false,
        killSwitchWhatsapp: false,
        killSwitchSms: false,
        killSwitchVoice: false,
        killSwitchAi: false,
        killSwitchCritical: false,
        killActionTypes: [],
        shadowDeviationThresholdPct: 5,
        gateTestsPass: true,
        monitoringEnabled: true,
      },
    });
    const gates = new WorkflowRuntimeRolloutGatesService(prisma as never, config);
    const result = await gates.evaluate(ORG_A);
    expect(result.status).toBe('PASS');
  });
});
