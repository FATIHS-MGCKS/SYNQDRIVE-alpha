import { BookingStatusOverrideAuditService } from './booking-status-override-audit.service';

describe('BookingStatusOverrideAuditService', () => {
  const prisma = {
    bookingStatusOverrideAuditEvent: {
      create: jest.fn(),
    },
  };

  const service = new BookingStatusOverrideAuditService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.bookingStatusOverrideAuditEvent.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('writes tamper-resistant override audit row', async () => {
    const id = await service.append({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      fromStatus: 'CANCELLED',
      toStatus: 'CONFIRMED',
      reason: 'Data repair after failed sync',
      affectedInvariants: ['STATUS_MACHINE_BYPASS', 'TERMINAL_REACTIVATION'],
      actor: { userId: 'user-1', displayName: 'Ops Admin' },
      requestContext: { ipTruncated: '203.0.113.xxx', userAgent: 'test-agent' },
      correlationId: 'override:bk-1:key',
    });

    expect(id).toBe('audit-1');
    expect(prisma.bookingStatusOverrideAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          bookingId: 'bk-1',
          contentHash: expect.any(String),
          requestIpTruncated: '203.0.113.xxx',
        }),
      }),
    );
  });
});
