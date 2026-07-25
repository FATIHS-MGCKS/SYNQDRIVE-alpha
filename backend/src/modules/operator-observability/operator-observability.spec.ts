import { OperatorObservabilityService } from './operator-observability.service';
import { OperatorMetricsService } from './operator-metrics.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  isOperatorApiPath,
  orgRef,
  resolveOperatorApiRoute,
  resolveCorrelationId,
} from './operator-observability.util';

describe('Operator observability', () => {
  describe('route resolution', () => {
    it('detects handover pickup routes', () => {
      expect(
        resolveOperatorApiRoute('/api/v1/organizations/org-1/bookings/bk-1/handover/pickup'),
      ).toBe('handover_pickup');
      expect(isOperatorApiPath('/organizations/org-1/tasks/t1/complete')).toBe(true);
    });

    it('does not match unrelated routes', () => {
      expect(resolveOperatorApiRoute('/api/v1/organizations/org-1/invoices')).toBeNull();
    });
  });

  describe('privacy helpers', () => {
    it('shortens organization id to orgRef', () => {
      expect(orgRef('12345678-abcd-efgh-ijkl-mnopqrstuvwx')).toBe('12345678');
      expect(orgRef(null)).toBeNull();
    });

    it('resolves correlation id from headers', () => {
      expect(resolveCorrelationId({ 'x-request-id': 'req-abc' })).toBe('req-abc');
    });
  });

  describe('OperatorObservabilityService', () => {
    it('records handover completion without throwing when metrics absent', () => {
      const service = new OperatorObservabilityService(null);
      expect(() =>
        service.recordHandoverCompletion(
          { correlationId: 'c1' },
          'pickup',
          'org-12345678',
          true,
        ),
      ).not.toThrow();
    });

    it('increments prometheus counters when metrics service present', async () => {
      const tripMetrics = new TripMetricsService();
      const metrics = new OperatorMetricsService(tripMetrics);
      const service = new OperatorObservabilityService(metrics);

      service.recordHandoverStart({ correlationId: 'c1' }, 'pickup', 'org-12345678');
      service.recordIdempotencyReplay('handover_pickup');
      service.recordAuthDenial('tenant_scope');

      const text = await tripMetrics.registry.metrics();
      expect(text).toContain('synqdrive_operator_handover_total');
      expect(text).toContain('synqdrive_operator_idempotency_replay_total');
      expect(text).toContain('synqdrive_operator_auth_denial_total');
    });
  });
});
