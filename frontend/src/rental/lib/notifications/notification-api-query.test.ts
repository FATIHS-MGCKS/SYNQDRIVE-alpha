import { describe, expect, it } from 'vitest';
import { appendNotificationQueryParams, buildNotificationQuerySuffix } from './notification-api-query';

describe('notification-api-query', () => {
  it('serializes cursor and readState filters', () => {
    const suffix = buildNotificationQuerySuffix({
      cursor: 'abc123',
      readState: 'unread',
      domain: 'OPERATIONS',
      activeOnly: true,
      limit: 25,
    });
    expect(suffix).toContain('cursor=abc123');
    expect(suffix).toContain('readState=unread');
    expect(suffix).toContain('domain=OPERATIONS');
    expect(suffix).toContain('activeOnly=true');
    expect(suffix).toContain('limit=25');
  });

  it('serializes multi-value severity as comma-separated', () => {
    const q = new URLSearchParams();
    appendNotificationQueryParams(q, { severity: ['CRITICAL', 'WARNING'] });
    expect(q.get('severity')).toBe('CRITICAL,WARNING');
  });
});
