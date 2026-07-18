import type { WorkflowCreatePayload, WorkflowDto, WorkflowRunDto, WorkflowUpdatePayload } from '../../../lib/api';
import {
  VOICE_AUTOMATION_CATALOG,
  VOICE_AUTOMATION_SCOPE_MARKER,
  type VoiceAutomationCatalogEntry,
  type VoiceAutomationUseCaseId,
} from './voice-automation.catalog';

export type VoiceAutomationWorkflowStatus = 'disabled' | 'draft' | 'active' | 'invalid';

export interface VoiceAutomationScopeConfig {
  useCaseId: VoiceAutomationUseCaseId;
  channel: 'voice';
  allowedCountries: string[];
  cooldownHours: number;
  maxCallsPerRun: number;
  allowedActions: string[];
  allowedWindows: 'business_hours' | 'always';
  requiresConfirmation: boolean;
  assistantName?: string | null;
}

export interface VoiceAutomationViewModel {
  catalog: VoiceAutomationCatalogEntry;
  workflow: WorkflowDto | null;
  status: VoiceAutomationWorkflowStatus;
  lastRun: WorkflowRunDto | null;
  lastRunOutcome: string | null;
  nextExecutionLabel: string | null;
}

function readScopeConfig(scope: WorkflowDto['scope']): VoiceAutomationScopeConfig | null {
  if (!scope || typeof scope !== 'object') return null;
  const record = scope as unknown as Record<string, unknown>;
  const voice = record[VOICE_AUTOMATION_SCOPE_MARKER];
  if (!voice || typeof voice !== 'object') return null;
  const cfg = voice as Record<string, unknown>;
  const useCaseId = cfg.useCaseId;
  if (typeof useCaseId !== 'string') return null;
  return {
    useCaseId: useCaseId as VoiceAutomationUseCaseId,
    channel: 'voice',
    allowedCountries: Array.isArray(cfg.allowedCountries)
      ? cfg.allowedCountries.filter((c): c is string => typeof c === 'string')
      : ['DE'],
    cooldownHours: typeof cfg.cooldownHours === 'number' ? cfg.cooldownHours : 24,
    maxCallsPerRun: typeof cfg.maxCallsPerRun === 'number' ? cfg.maxCallsPerRun : 25,
    allowedActions: Array.isArray(cfg.allowedActions)
      ? cfg.allowedActions.filter((a): a is string => typeof a === 'string')
      : [],
    allowedWindows: cfg.allowedWindows === 'always' ? 'always' : 'business_hours',
    requiresConfirmation: cfg.requiresConfirmation !== false,
    assistantName: typeof cfg.assistantName === 'string' ? cfg.assistantName : null,
  };
}

export function findWorkflowForUseCase(
  workflows: WorkflowDto[],
  useCaseId: VoiceAutomationUseCaseId,
): WorkflowDto | null {
  return (
    workflows.find(wf => {
      const cfg = readScopeConfig(wf.scope);
      if (cfg?.useCaseId === useCaseId) return true;
      return wf.name === workflowNameForUseCase(useCaseId);
    }) ?? null
  );
}

export function workflowNameForUseCase(useCaseId: VoiceAutomationUseCaseId): string {
  return `Voice · ${useCaseId}`;
}

export function resolveAutomationStatus(workflow: WorkflowDto | null): VoiceAutomationWorkflowStatus {
  if (!workflow) return 'disabled';
  if (workflow.status === 'INVALID') return 'invalid';
  if (workflow.status === 'ACTIVE' && workflow.enabled) return 'active';
  if (workflow.status === 'DRAFT') return 'draft';
  return 'disabled';
}

export function summarizeLastRun(run: WorkflowRunDto | null): string | null {
  if (!run) return null;
  if (run.status === 'COMPLETED') return 'completed';
  if (run.status === 'FAILED') return 'failed';
  if (run.status === 'WAITING_APPROVAL') return 'waiting_approval';
  return run.status.toLowerCase();
}

export function buildAutomationViewModels(
  workflows: WorkflowDto[],
  runsByWorkflowId: Record<string, WorkflowRunDto | null>,
): VoiceAutomationViewModel[] {
  return VOICE_AUTOMATION_CATALOG.map(catalog => {
    const workflow = findWorkflowForUseCase(workflows, catalog.id);
    const lastRun = workflow ? runsByWorkflowId[workflow.id] ?? null : null;
    return {
      catalog,
      workflow,
      status: resolveAutomationStatus(workflow),
      lastRun,
      lastRunOutcome: summarizeLastRun(lastRun),
      nextExecutionLabel: workflow?.enabled ? 'event_driven' : null,
    };
  });
}

export function buildWorkflowCreatePayload(params: {
  catalog: VoiceAutomationCatalogEntry;
  assistantName: string;
  activate: boolean;
}): WorkflowCreatePayload {
  const scopeConfig: VoiceAutomationScopeConfig = {
    useCaseId: params.catalog.id,
    channel: 'voice',
    allowedCountries: params.catalog.defaultAllowedCountries,
    cooldownHours: params.catalog.defaultCooldownHours,
    maxCallsPerRun: params.catalog.defaultMaxCallsPerRun,
    allowedActions: params.catalog.defaultAllowedActions,
    allowedWindows: 'business_hours',
    requiresConfirmation: params.catalog.requiresConfirmation,
    assistantName: params.assistantName,
  };

  return {
    name: workflowNameForUseCase(params.catalog.id),
    description: `Voice outbound automation (${params.catalog.id})`,
    category: params.catalog.category,
    trigger: {
      type: params.catalog.triggerEvent,
      config: { channel: 'voice', useCase: params.catalog.id },
    },
    conditions: [],
    actions: [
      {
        type: 'notification.prepare',
        requiresApproval: params.catalog.requiresConfirmation,
        config: {
          channel: 'voice',
          useCase: params.catalog.id,
          maxRecipients: params.catalog.defaultMaxCallsPerRun,
          cooldownHours: params.catalog.defaultCooldownHours,
          allowedCountries: params.catalog.defaultAllowedCountries,
        },
      },
    ],
    scope: {
      type: 'organization',
      [VOICE_AUTOMATION_SCOPE_MARKER]: scopeConfig,
    } as unknown as WorkflowDto['scope'],
    status: params.activate ? 'ACTIVE' : 'DRAFT',
  };
}

export function buildWorkflowUpdatePayload(
  workflow: WorkflowDto,
  patch: Partial<VoiceAutomationScopeConfig> & { status?: 'DRAFT' | 'ACTIVE' | 'DISABLED' },
): WorkflowUpdatePayload {
  const current = readScopeConfig(workflow.scope) ?? {
    useCaseId: 'pickup_confirmation' as VoiceAutomationUseCaseId,
    channel: 'voice' as const,
    allowedCountries: ['DE'],
    cooldownHours: 24,
    maxCallsPerRun: 25,
    allowedActions: [],
    allowedWindows: 'business_hours' as const,
    requiresConfirmation: true,
  };

  const nextScope = {
    type: workflow.scope?.type ?? 'organization',
    ...(workflow.scope as unknown as Record<string, unknown>),
    [VOICE_AUTOMATION_SCOPE_MARKER]: { ...current, ...patch },
  };

  return {
    scope: nextScope as unknown as WorkflowDto['scope'],
    ...(patch.status ? { status: patch.status } : {}),
  };
}

export function readAutomationScope(workflow: WorkflowDto | null): VoiceAutomationScopeConfig | null {
  if (!workflow) return null;
  return readScopeConfig(workflow.scope);
}
