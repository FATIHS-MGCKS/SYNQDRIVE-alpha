import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkflowRunDto } from '../../../lib/api';
import {
  deriveRunHistoryFlags,
  formatRunCorrelation,
  sanitizeClientPreviewValue,
  shouldAcceptSimulationResponse,
} from './workflow-simulate.utils';

describe('workflow-simulate.utils', () => {
  it('accepts only the latest simulation sequence', () => {
    expect(shouldAcceptSimulationResponse(2, 2)).toBe(true);
    expect(shouldAcceptSimulationResponse(1, 2)).toBe(false);
  });

  it('strips secret-like keys from client preview payloads', () => {
    const sanitized = sanitizeClientPreviewValue({
      title: 'Task',
      apiKey: 'secret-value',
      nested: { password: 'x' },
    }) as Record<string, unknown>;

    expect(sanitized.title).toBe('Task');
    expect(sanitized.apiKey).toBeUndefined();
    expect((sanitized.nested as Record<string, unknown>).password).toBeUndefined();
  });

  it('detects partial failure from mixed action run statuses', () => {
    const run: WorkflowRunDto = {
      id: 'run-1',
      organizationId: 'org-1',
      workflowId: 'wf-1',
      workflowVersion: 2,
      eventType: 'booking.returned',
      status: 'SUCCESS',
      inputPayload: {},
      idempotencyKey: 'idem-abc-123',
      startedAt: '2026-07-25T10:00:00.000Z',
      actionRuns: [
        {
          id: 'a1',
          organizationId: 'org-1',
          workflowRunId: 'run-1',
          workflowId: 'wf-1',
          actionType: 'task.create',
          actionIndex: 0,
          status: 'SUCCESS',
          requiresApproval: false,
          createdAt: '2026-07-25T10:00:01.000Z',
        },
        {
          id: 'a2',
          organizationId: 'org-1',
          workflowRunId: 'run-1',
          workflowId: 'wf-1',
          actionType: 'notification.prepare',
          actionIndex: 1,
          status: 'FAILED',
          requiresApproval: false,
          createdAt: '2026-07-25T10:00:02.000Z',
        },
      ],
      createdAt: '2026-07-25T10:00:00.000Z',
    };

    const flags = deriveRunHistoryFlags(run);
    expect(flags.partialFailure).toBe(true);
    expect(flags.hasApproval).toBe(false);
  });

  it('detects policy suppression for skipped runs', () => {
    const run: WorkflowRunDto = {
      id: 'run-2',
      organizationId: 'org-1',
      workflowId: 'wf-1',
      workflowVersion: 1,
      eventType: 'manual.test',
      status: 'SKIPPED',
      inputPayload: {},
      conditionResult: { passed: false },
      idempotencyKey: 'idem-skipped',
      startedAt: '2026-07-25T10:00:00.000Z',
      createdAt: '2026-07-25T10:00:00.000Z',
    };

    expect(deriveRunHistoryFlags(run).policySuppressed).toBe(true);
  });

  it('masks correlation id for history display', () => {
    expect(formatRunCorrelation({
      id: '00000000-0000-0000-0000-000000000001',
      idempotencyKey: 'manual.test:wf-1:1234567890',
    } as WorkflowRunDto)).toBe('manual.test:wf-1:1234567');
  });
});

describe('workflow simulation race handling', () => {
  it('drops stale responses when sequence advances', async () => {
    let latestSequence = 0;
    const responses: number[] = [];

    const run = async (sequence: number, delayMs: number) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (shouldAcceptSimulationResponse(sequence, latestSequence)) {
        responses.push(sequence);
      }
    };

    latestSequence = 1;
    const slow = run(1, 30);
    latestSequence = 2;
    const fast = run(2, 5);
    await Promise.all([slow, fast]);

    expect(responses).toEqual([2]);
  });
});

describe('workflow simulate UI accessibility', () => {
  it('exposes aria-live regions for dry-run and history panels', () => {
    const dryRunSource = readFileSync(resolve(__dirname, 'WorkflowDryRunPanel.tsx'), 'utf8');
    const historySource = readFileSync(resolve(__dirname, 'WorkflowExecutionHistoryPanel.tsx'), 'utf8');

    expect(dryRunSource).toContain('aria-live="polite"');
    expect(dryRunSource).toContain('role="status"');
    expect(historySource).toContain('aria-live="polite"');
    expect(historySource).toContain('aria-expanded');
    expect(historySource).toContain('min-h-11');
  });

  it('shows audit permission denial without leaking run payloads', () => {
    const historySource = readFileSync(resolve(__dirname, 'WorkflowExecutionHistoryPanel.tsx'), 'utf8');
    expect(historySource).toContain('canViewAudit');
    expect(historySource).toContain('workflowAutomation.history.auditDenied');
  });
});
