import type { WorkflowRuntimeEffectiveFlags } from './workflow-runtime-rollout.contract';

export function makeRolloutEffectiveFlags(
  overrides: Partial<WorkflowRuntimeEffectiveFlags> = {},
): WorkflowRuntimeEffectiveFlags {
  return {
    organizationId: 'org-test',
    globalStage: 'GENERAL_AVAILABILITY',
    orgStage: 'GENERAL_AVAILABILITY',
    effectiveStage: 'GENERAL_AVAILABILITY',
    orgInRolloutAllowlist: true,
    workflowInAllowlist: true,
    executionPath: 'workflow_live',
    runShadow: false,
    runLiveEngine: true,
    runLegacyBridge: false,
    channelEmail: true,
    channelWhatsapp: true,
    channelSms: true,
    channelVoice: true,
    channelAi: true,
    criticalActions: true,
    killSwitchActive: false,
    killSwitchReasons: [],
    monitoringLinked: true,
    ...overrides,
  };
}

export function makeRolloutServiceMock(
  overrides: Partial<WorkflowRuntimeEffectiveFlags> = {},
) {
  const flags = makeRolloutEffectiveFlags(overrides);
  return {
    resolveEffectiveFlags: jest.fn().mockResolvedValue(flags),
    resolveBridgeExecutionPath: jest.fn().mockResolvedValue(flags.executionPath),
    canExecuteLiveAction: jest.fn().mockResolvedValue({
      allowed: !flags.killSwitchActive && flags.runLiveEngine,
      reasons: flags.killSwitchActive ? flags.killSwitchReasons : [],
    }),
    invalidateOrgCache: jest.fn(),
    getOrgSettings: jest.fn(),
    updateOrgSettings: jest.fn(),
    setKillSwitch: jest.fn(),
    evaluatePreDeploymentGates: jest.fn(),
  };
}
