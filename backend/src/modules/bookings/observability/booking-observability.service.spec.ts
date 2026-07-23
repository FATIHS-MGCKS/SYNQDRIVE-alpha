import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BookingObservabilityService } from './booking-observability.service';
import { BookingProcessingFailureRepository } from './booking-processing-failure.repository';
import {
  BOOKING_FAILURE_CATEGORIES,
  BOOKING_OBSERVABILITY_OPERATIONS,
  BOOKING_SAFE_ERROR_CODES,
} from './booking-observability.constants';

describe('BookingObservabilityService', () => {
  const failures = {
    create: jest.fn().mockResolvedValue({ id: 'f1' }),
  } as unknown as BookingProcessingFailureRepository;

  let metrics: TripMetricsService;
  let service: BookingObservabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    metrics = new TripMetricsService();
    service = new BookingObservabilityService(metrics, failures);
  });

  it('records create success and failure metrics', async () => {
    const ctx = {
      organizationId: 'org-1',
      bookingId: 'booking-1',
      correlationId: 'corr-1',
    };

    service.recordCreateSuccess(ctx);
    service.recordCreateFailure(ctx, { code: 'INVOICE_BOOTSTRAP_FAILED' });

    const text = await metrics.getMetrics();
    expect(text).toContain('synqdrive_booking_create_success_total');
    expect(text).toContain('synqdrive_booking_create_failure_total');
    expect(failures.create).toHaveBeenCalled();
  });

  it('records conflict and tenant denial counters', async () => {
    service.recordConflict(
      { organizationId: 'org-1', correlationId: 'overlap:veh-1' },
      BOOKING_SAFE_ERROR_CODES.VEHICLE_BOOKING_OVERLAP,
    );
    service.recordTenantDenial(
      { organizationId: 'org-1', bookingId: 'booking-1' },
      BOOKING_SAFE_ERROR_CODES.TENANT_MISMATCH,
    );

    const text = await metrics.getMetrics();
    expect(text).toContain('synqdrive_booking_conflict_total');
    expect(text).toContain('synqdrive_booking_tenant_denial_total');
  });

  it('persists redacted failures from runSideEffect without throwing', async () => {
    await service.runSideEffect(
      {
        organizationId: 'org-1',
        bookingId: 'booking-1',
        correlationId: 'task:booking-1',
        operation: BOOKING_OBSERVABILITY_OPERATIONS.TASK_SYNC,
        category: BOOKING_FAILURE_CATEGORIES.TASK,
        errorCode: BOOKING_SAFE_ERROR_CODES.TASK_SYNC_FAILED,
      },
      async () => {
        throw new Error('task sync failed for ops@tenant.example');
      },
    );

    expect(failures.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        category: BOOKING_FAILURE_CATEGORIES.TASK,
        errorCode: BOOKING_SAFE_ERROR_CODES.TASK_SYNC_FAILED,
        message: expect.not.stringContaining('ops@tenant.example'),
      }),
    );

    const text = await metrics.getMetrics();
    expect(text).toContain('synqdrive_booking_task_failure_total');
  });
});
