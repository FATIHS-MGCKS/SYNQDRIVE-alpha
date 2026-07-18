import { describe, expect, it } from 'vitest';
import {
  filterOrgAuditEvents,
  filterOrgWebhookEvents,
  formatOrgIdForDisplay,
  maskTechnicalId,
} from './voice-org-workspace.ops';

describe('voice-org-workspace.ops', () => {
  it('masks technical ids', () => {
    expect(maskTechnicalId('agent_abcdefghijklmnop')).toContain('…');
    expect(maskTechnicalId(null)).toBe('—');
  });

  it('masks org id for display', () => {
    expect(formatOrgIdForDisplay('org-1234567890abcdef')).not.toContain('org-1234567890abcdef');
  });

  it('filters org-scoped webhook events', () => {
    const events = filterOrgWebhookEvents(
      [
        {
          id: 'e1',
          organizationId: 'org-1',
          organizationName: 'A',
          provider: 'TWILIO',
          eventType: 'call',
          status: 'FAILED',
          receivedAt: '2026-07-18T10:00:00.000Z',
          processedAt: null,
          retryCount: 1,
          errorCode: null,
          errorMessage: 'timeout',
          diagnosticSummary: 'redacted',
        },
        {
          id: 'e2',
          organizationId: 'org-2',
          organizationName: 'B',
          provider: 'TWILIO',
          eventType: 'call',
          status: 'PROCESSED',
          receivedAt: '2026-07-18T10:00:00.000Z',
          processedAt: '2026-07-18T10:01:00.000Z',
          retryCount: 0,
          errorCode: null,
          errorMessage: null,
          diagnosticSummary: null,
        },
      ],
      'org-1',
    );
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('e1');
  });

  it('filters org-scoped audit events', () => {
    const events = filterOrgAuditEvents(
      [
        {
          id: 'a1',
          category: 'protection',
          organizationId: 'org-1',
          organizationName: 'A',
          action: 'SUSPEND',
          reasonCode: 'master_admin_suspend',
          message: 'abuse',
          actorUserId: 'admin-1',
          createdAt: '2026-07-18T10:00:00.000Z',
        },
        {
          id: 'a2',
          category: 'protection',
          organizationId: 'org-2',
          organizationName: 'B',
          action: 'SUSPEND',
          reasonCode: 'master_admin_suspend',
          message: 'other',
          actorUserId: 'admin-1',
          createdAt: '2026-07-18T10:00:00.000Z',
        },
      ],
      'org-1',
    );
    expect(events).toHaveLength(1);
  });
});
