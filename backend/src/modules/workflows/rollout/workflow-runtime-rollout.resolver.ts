import { ConfigService } from '@nestjs/config';
import type { OrgWorkflowRuntimeRolloutSettings } from '@prisma/client';
import {
  isRolloutStageAtLeast,
  type WorkflowRuntimeBridgeExecutionPath,
  type WorkflowRuntimeEffectiveFlags,
  type WorkflowRuntimeGlobalRolloutConfig,
  type WorkflowRuntimeOrgRolloutSettings,
  type WorkflowRuntimeRolloutStage,
} from './workflow-runtime-rollout.contract';

function defaultOrgSettings(): WorkflowRuntimeOrgRolloutSettings {
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
  };
}

function mapOrgRow(row: OrgWorkflowRuntimeRolloutSettings | null): WorkflowRuntimeOrgRolloutSettings {
  if (!row) return defaultOrgSettings();
  return {
    stage: row.stage,
    workflowAllowlist: row.workflowAllowlist ?? [],
    killSwitchEnabled: row.killSwitchEnabled,
    killSwitchEmail: row.killSwitchEmail,
    killSwitchWhatsapp: row.killSwitchWhatsapp,
    killSwitchSms: row.killSwitchSms,
    killSwitchVoice: row.killSwitchVoice,
    killSwitchAi: row.killSwitchAi,
    killSwitchCritical: row.killSwitchCritical,
    channelEmailEnabled: row.channelEmailEnabled,
    channelWhatsappEnabled: row.channelWhatsappEnabled,
    channelSmsEnabled: row.channelSmsEnabled,
    channelVoiceEnabled: row.channelVoiceEnabled,
    channelAiEnabled: row.channelAiEnabled,
    criticalActionsEnabled: row.criticalActionsEnabled,
    monitoringAcknowledged: row.monitoringAcknowledged,
  };
}

export function readGlobalRolloutConfig(config: ConfigService): WorkflowRuntimeGlobalRolloutConfig {
  const allowlistRaw = config.get<string[]>('workflowRuntimeRollout.orgAllowlist') ?? [];
  const allowlist = allowlistRaw.length > 0 ? new Set(allowlistRaw) : null;
  const killTypes = config.get<string[]>('workflowRuntimeRollout.killActionTypes') ?? [];
  return {
    stage: config.get<WorkflowRuntimeRolloutStage>('workflowRuntimeRollout.stage') ?? 'DISABLED',
    orgAllowlist: allowlist,
    killSwitchGlobal: config.get<boolean>('workflowRuntimeRollout.killSwitchGlobal') === true,
    killSwitchEmail: config.get<boolean>('workflowRuntimeRollout.killSwitchEmail') === true,
    killSwitchWhatsapp: config.get<boolean>('workflowRuntimeRollout.killSwitchWhatsapp') === true,
    killSwitchSms: config.get<boolean>('workflowRuntimeRollout.killSwitchSms') === true,
    killSwitchVoice: config.get<boolean>('workflowRuntimeRollout.killSwitchVoice') === true,
    killSwitchAi: config.get<boolean>('workflowRuntimeRollout.killSwitchAi') === true,
    killSwitchCritical: config.get<boolean>('workflowRuntimeRollout.killSwitchCritical') === true,
    killActionTypes: new Set(killTypes),
    shadowDeviationThresholdPct:
      config.get<number>('workflowRuntimeRollout.shadowDeviationThresholdPct') ?? 5,
    gateTestsPass: config.get<boolean>('workflowRuntimeRollout.gateTestsPass') === true,
    monitoringEnabled: config.get<boolean>('workflowRuntimeRollout.monitoringEnabled') === true,
  };
}

function resolveEffectiveStage(
  global: WorkflowRuntimeGlobalRolloutConfig,
  org: WorkflowRuntimeOrgRolloutSettings,
  orgId: string,
): WorkflowRuntimeRolloutStage {
  if (global.killSwitchGlobal) return 'DISABLED';
  if (global.stage === 'DISABLED' && org.stage === 'DISABLED') return 'DISABLED';

  const orgInAllowlist =
    global.orgAllowlist == null || global.orgAllowlist.has(orgId);

  if (global.stage === 'SELECTED_ORGANIZATIONS' && !orgInAllowlist) {
    return 'DISABLED';
  }

  const globalIdx = ['DISABLED', 'SHADOW', 'INTERNAL_ACTIONS_ONLY', 'SELECTED_WORKFLOWS', 'SELECTED_ORGANIZATIONS', 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL', 'GENERAL_AVAILABILITY'].indexOf(global.stage);
  const orgIdx = ['DISABLED', 'SHADOW', 'INTERNAL_ACTIONS_ONLY', 'SELECTED_WORKFLOWS', 'SELECTED_ORGANIZATIONS', 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL', 'GENERAL_AVAILABILITY'].indexOf(org.stage);
  const stages = ['DISABLED', 'SHADOW', 'INTERNAL_ACTIONS_ONLY', 'SELECTED_WORKFLOWS', 'SELECTED_ORGANIZATIONS', 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL', 'GENERAL_AVAILABILITY'] as WorkflowRuntimeRolloutStage[];
  const cappedIdx = Math.min(globalIdx, orgIdx);
  return stages[Math.max(0, cappedIdx)] ?? 'DISABLED';
}

function resolveBridgePath(
  stage: WorkflowRuntimeRolloutStage,
  killSwitch: boolean,
  workflowInAllowlist: boolean,
): WorkflowRuntimeBridgeExecutionPath {
  if (killSwitch) return 'legacy_only';
  if (stage === 'DISABLED') return 'legacy_only';
  if (stage === 'SHADOW') return 'shadow_compare';
  if (stage === 'INTERNAL_ACTIONS_ONLY') return 'workflow_live';
  if (stage === 'SELECTED_WORKFLOWS') {
    return workflowInAllowlist ? 'workflow_live' : 'legacy_only';
  }
  if (isRolloutStageAtLeast(stage, 'SELECTED_ORGANIZATIONS')) return 'workflow_live';
  return 'legacy_only';
}

export function resolveEffectiveRolloutFlags(input: {
  organizationId: string;
  workflowId?: string;
  global: WorkflowRuntimeGlobalRolloutConfig;
  org: WorkflowRuntimeOrgRolloutSettings;
}): WorkflowRuntimeEffectiveFlags {
  const orgInRolloutAllowlist =
    input.global.orgAllowlist == null || input.global.orgAllowlist.has(input.organizationId);
  const workflowInAllowlist =
    input.workflowId != null && input.org.workflowAllowlist.includes(input.workflowId);

  const killSwitchReasons: string[] = [];
  if (input.global.killSwitchGlobal) killSwitchReasons.push('global_kill_switch');
  if (input.org.killSwitchEnabled) killSwitchReasons.push('org_kill_switch');

  const killSwitchActive = killSwitchReasons.length > 0;
  const effectiveStage = resolveEffectiveStage(input.global, input.org, input.organizationId);
  const executionPath = resolveBridgePath(effectiveStage, killSwitchActive, workflowInAllowlist);

  const runShadow =
    !killSwitchActive
    && (effectiveStage === 'SHADOW' || isRolloutStageAtLeast(effectiveStage, 'INTERNAL_ACTIONS_ONLY'));

  const runLiveEngine =
    !killSwitchActive
    && isRolloutStageAtLeast(effectiveStage, 'INTERNAL_ACTIONS_ONLY')
    && (effectiveStage !== 'SELECTED_WORKFLOWS' || workflowInAllowlist);

  const runLegacyBridge = executionPath === 'legacy_only' || executionPath === 'shadow_compare';

  const channelEnabled = (orgFlag: boolean, globalStage: WorkflowRuntimeRolloutStage) =>
    !killSwitchActive
    && orgFlag
    && isRolloutStageAtLeast(globalStage, 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL');

  return {
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    globalStage: input.global.stage,
    orgStage: input.org.stage,
    effectiveStage,
    orgInRolloutAllowlist,
    workflowInAllowlist,
    executionPath,
    runShadow,
    runLiveEngine,
    runLegacyBridge,
    channelEmail: channelEnabled(input.org.channelEmailEnabled, effectiveStage),
    channelWhatsapp: channelEnabled(input.org.channelWhatsappEnabled, effectiveStage),
    channelSms: channelEnabled(input.org.channelSmsEnabled, effectiveStage),
    channelVoice: channelEnabled(input.org.channelVoiceEnabled, effectiveStage),
    channelAi: channelEnabled(input.org.channelAiEnabled, effectiveStage),
    criticalActions:
      !killSwitchActive
      && input.org.criticalActionsEnabled
      && isRolloutStageAtLeast(effectiveStage, 'INTERNAL_ACTIONS_ONLY'),
    killSwitchActive,
    killSwitchReasons,
    monitoringLinked:
      input.global.monitoringEnabled && input.org.monitoringAcknowledged,
  };
}

export { defaultOrgSettings, mapOrgRow };
