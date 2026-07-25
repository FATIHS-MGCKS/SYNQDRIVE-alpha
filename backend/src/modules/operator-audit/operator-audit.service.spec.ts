import { BusinessAuditAction } from '@modules/business-audit/business-audit.constants';
import { OperatorAuditService } from './operator-audit.service';
import {
  minimizeHandoverProtocolPayload,
  minimizeOperatorAuditState,
} from './operator-audit-payload.util';

describe('operator-audit-payload.util', () => {
  it('redacts signature and image fields', () => {
    const minimized = minimizeOperatorAuditState({
      customerSignatureDataUrl: 'data:image/png;base64,abc',
      odometerKm: 12000,
    });
    expect(minimized?.customerSignatureDataUrl).toBe('[binary-data-url]');
    expect(minimized?.odometerKm).toBe(12000);
  });

  it('summarizes handover payload without bitmaps', () => {
    const summary = minimizeHandoverProtocolPayload({
      actualStationId: 'station-1',
      odometerKm: 1000,
      customerSignatureDataUrl: 'data:image/png;base64,abc',
      staffSignatureDataUrl: 'data:image/png;base64,def',
      damageIds: ['d1'],
      technicalObservations: [{ description: 'noise', severity: 'LOW', category: 'ENGINE', affectedArea: 'FRONT' }],
    } as never);
    expect(summary.hasCustomerSignature).toBe(true);
    expect(summary.hasStaffSignature).toBe(true);
    expect(summary).not.toHaveProperty('customerSignatureDataUrl');
  });
});

describe('OperatorAuditService', () => {
  const businessAudit = {
    enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    flushCritical: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    businessAuditOutbox: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  function makeService() {
    return new OperatorAuditService(businessAudit as never, prisma as never);
  }

  it('enqueues minimized audit events with idempotency metadata', async () => {
    const svc = makeService();
    await svc.record({
      organizationId: 'org-1',
      action: BusinessAuditAction.OPERATOR_HANDOVER_PICKUP_COMPLETED,
      entityType: 'HANDOVER_PROTOCOL',
      entityId: 'proto-1',
      actorUserId: 'user-1',
      outcome: 'SUCCESS',
      correlationId: 'handover-complete:b1:PICKUP:proto-1',
      description: 'Handover PICKUP completed',
      after: { hasCustomerSignature: true },
      metadata: { bookingId: 'b1' },
    });

    expect(businessAudit.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        idempotencyKey: expect.stringContaining('org-1'),
        action: BusinessAuditAction.OPERATOR_HANDOVER_PICKUP_COMPLETED,
        entityId: 'proto-1',
      }),
    );
  });

  it('flushes critical events', async () => {
    const svc = makeService();
    await svc.record({
      organizationId: 'org-1',
      action: BusinessAuditAction.OPERATOR_BOOKING_CANCELLED,
      entityType: 'BOOKING',
      entityId: 'b1',
      outcome: 'SUCCESS',
      correlationId: 'booking-cancel:b1',
      description: 'Booking cancelled',
      critical: true,
    });
    expect(businessAudit.flushCritical).toHaveBeenCalledWith(['outbox-1']);
  });

  it('scopes audit list queries by organization', async () => {
    const svc = makeService();
    await svc.listForOrganization('org-tenant', { limit: 10 });
    expect(prisma.businessAuditOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant' }),
      }),
    );
  });

  it('records permission denied without throwing', () => {
    const svc = makeService();
    expect(() =>
      svc.recordPermissionDenied({
        organizationId: 'org-1',
        actorUserId: 'user-1',
        module: 'bookings',
        level: 'manage',
        requestId: 'req-1',
      }),
    ).not.toThrow();
    expect(businessAudit.enqueue).toHaveBeenCalled();
  });
});
