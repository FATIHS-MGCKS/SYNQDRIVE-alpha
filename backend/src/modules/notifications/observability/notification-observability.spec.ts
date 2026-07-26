import {
  buildNotificationLogFields,
  toOrganizationLogRef,
} from './notification-observability.util';
import { recordNotificationCandidate } from './notification-prometheus.metrics';

describe('notification observability', () => {
  it('hashes organization id for logs only', () => {
    expect(toOrganizationLogRef('org-abcdef12-3456')).toBe('org-abcd');
  });

  it('builds structured log fields without message text', () => {
    const fields = buildNotificationLogFields({
      msg: 'notification.ingest.created',
      organizationId: 'org-abcdef12-3456',
      action: 'created',
      result: 'success',
      correlationId: 'run-1',
      eventType: 'STATION_SHORTAGE',
      notificationId: 'notif-1',
      latencyMs: 12,
    });
    expect(fields).toMatchObject({
      organizationRef: 'org-abcd',
      correlationId: 'run-1',
      action: 'created',
      result: 'success',
      latencyMs: 12,
    });
    expect(fields).not.toHaveProperty('titleKey');
    expect(fields).not.toHaveProperty('bodyKey');
  });

  it('records candidate metrics with bounded labels', () => {
    const inc = jest.fn();
    const metrics = { notificationCandidatesTotal: { inc } } as any;
    recordNotificationCandidate(metrics, {
      sourceType: 'SYSTEM',
      eventType: 'STATION_SHORTAGE',
    });
    expect(inc).toHaveBeenCalledWith({
      source_type: 'SYSTEM',
      event_type: 'STATION_SHORTAGE',
    });
  });
});
