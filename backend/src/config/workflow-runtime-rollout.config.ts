import { registerAs } from '@nestjs/config';
import {
  parseRolloutStage,
  WORKFLOW_RUNTIME_GATE_TESTS_PASS_ENV,
  WORKFLOW_RUNTIME_KILL_ACTION_TYPES_ENV,
  WORKFLOW_RUNTIME_KILL_AI_ENV,
  WORKFLOW_RUNTIME_KILL_CRITICAL_ENV,
  WORKFLOW_RUNTIME_KILL_EMAIL_ENV,
  WORKFLOW_RUNTIME_KILL_SMS_ENV,
  WORKFLOW_RUNTIME_KILL_SWITCH_ENV,
  WORKFLOW_RUNTIME_KILL_VOICE_ENV,
  WORKFLOW_RUNTIME_KILL_WHATSAPP_ENV,
  WORKFLOW_RUNTIME_MONITORING_ENABLED_ENV,
  WORKFLOW_RUNTIME_ORG_ALLOWLIST_ENV,
  WORKFLOW_RUNTIME_ROLLOUT_STAGE_ENV,
  WORKFLOW_RUNTIME_SHADOW_DEVIATION_THRESHOLD_ENV,
} from '@modules/workflows/rollout/workflow-runtime-rollout.contract';

function parseBoolean(raw: string | undefined, defaultValue = false): boolean {
  if (raw == null || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

function parseOrgAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function parseKillActionTypes(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

export default registerAs('workflowRuntimeRollout', () => ({
  stage: parseRolloutStage(process.env[WORKFLOW_RUNTIME_ROLLOUT_STAGE_ENV]),
  orgAllowlist: parseOrgAllowlist(process.env[WORKFLOW_RUNTIME_ORG_ALLOWLIST_ENV]),
  killSwitchGlobal: parseBoolean(process.env[WORKFLOW_RUNTIME_KILL_SWITCH_ENV]),
  killSwitchEmail: parseBoolean(process.env[WORKFLOW_RUNTIME_KILL_EMAIL_ENV]),
  killSwitchWhatsapp: parseBoolean(process.env[WORKFLOW_RUNTIME_KILL_WHATSAPP_ENV]),
  killSwitchSms: parseBoolean(process.env[WORKFLOW_RUNTIME_KILL_SMS_ENV]),
  killSwitchVoice: parseBoolean(process.env[WORKFLOW_RUNTIME_KILL_VOICE_ENV]),
  killSwitchAi: parseBoolean(process.env[WORKFLOW_RUNTIME_KILL_AI_ENV]),
  killSwitchCritical: parseBoolean(process.env[WORKFLOW_RUNTIME_KILL_CRITICAL_ENV]),
  killActionTypes: parseKillActionTypes(process.env[WORKFLOW_RUNTIME_KILL_ACTION_TYPES_ENV]),
  shadowDeviationThresholdPct: Number(
    process.env[WORKFLOW_RUNTIME_SHADOW_DEVIATION_THRESHOLD_ENV] ?? 5,
  ),
  gateTestsPass: parseBoolean(process.env[WORKFLOW_RUNTIME_GATE_TESTS_PASS_ENV]),
  monitoringEnabled: parseBoolean(process.env[WORKFLOW_RUNTIME_MONITORING_ENABLED_ENV]),
}));
