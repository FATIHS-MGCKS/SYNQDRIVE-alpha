import { describe, expect, it } from 'vitest';
import type { WorkflowDto, WorkflowRunDto } from '../../../lib/api';
import {
  buildAutomationViewModels,
  buildWorkflowCreatePayload,
  resolveAutomationStatus,
  summarizeLastRun,
} from './voice-automation.ops';

const workflow = (overrides: Partial<WorkflowDto> = {}): WorkflowDto =>
  ({
    id: 'wf-1',
    name: 'Voice · pickup_confirmation',
    status: 'ACTIVE',
    enabled: true,
    scope: {
      voiceAutomation: {
        useCaseId: 'pickup_confirmation',
        channel: 'voice',
        allowedCountries: ['DE'],
        cooldownHours: 24,
        maxCallsPerRun: 25,
        allowedActions: ['booking_lookup'],
        allowedWindows: 'business_hours',
        requiresConfirmation: true,
      },
    },
    ...overrides,
  }) as WorkflowDto;

describe('voice-automation.ops', () => {
  it('maps all catalog use cases even without workflows', () => {
    const models = buildAutomationViewModels([], {});
    expect(models).toHaveLength(8);
    expect(models.filter(m => m.workflow).length).toBe(0);
  });

  it('resolves active status from workflow', () => {
    expect(resolveAutomationStatus(workflow())).toBe('active');
    expect(resolveAutomationStatus(workflow({ enabled: false }))).toBe('disabled');
    expect(resolveAutomationStatus(workflow({ status: 'INVALID' }))).toBe('invalid');
  });

  it('summarizes last run outcomes', () => {
    expect(summarizeLastRun({ status: 'COMPLETED' } as WorkflowRunDto)).toBe('completed');
    expect(summarizeLastRun({ status: 'WAITING_APPROVAL' } as WorkflowRunDto)).toBe('waiting_approval');
    expect(summarizeLastRun(null)).toBeNull();
  });

  it('builds workflow create payload with voice scope and notification.prepare', () => {
    const models = buildAutomationViewModels([], {});
    const pickup = models.find(m => m.catalog.id === 'pickup_confirmation')!;
    const payload = buildWorkflowCreatePayload({
      catalog: pickup.catalog,
      assistantName: 'Synq',
      activate: true,
    });
    expect(payload.name).toBe('Voice · pickup_confirmation');
    expect(payload.actions[0].type).toBe('notification.prepare');
    expect(payload.actions[0].requiresApproval).toBe(true);
    expect((payload.scope as Record<string, unknown>).voiceAutomation).toBeTruthy();
  });

  it('attaches last run to matching workflow', () => {
    const wf = workflow();
    const run = { id: 'run-1', status: 'COMPLETED', startedAt: '2026-07-18T10:00:00Z' } as WorkflowRunDto;
    const models = buildAutomationViewModels([wf], { [wf.id]: run });
    const pickup = models.find(m => m.catalog.id === 'pickup_confirmation');
    expect(pickup?.lastRun?.id).toBe('run-1');
    expect(pickup?.lastRunOutcome).toBe('completed');
  });
});
