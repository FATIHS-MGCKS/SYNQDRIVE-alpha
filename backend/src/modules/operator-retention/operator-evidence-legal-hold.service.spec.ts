import { NotFoundException } from '@nestjs/common';
import { OperatorEvidenceLegalHoldService } from './operator-evidence-legal-hold.service';

describe('OperatorEvidenceLegalHoldService', () => {
  function makeService() {
    const bookingFindFirst = jest.fn().mockResolvedValue({ id: 'booking-1' });
    const legalHoldFindFirst = jest.fn();
    const legalHoldUpsert = jest.fn().mockResolvedValue({
      id: 'hold-1',
      organizationId: 'org-1',
      bookingId: 'booking-1',
      active: true,
      reason: 'Dispute',
      setAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const legalHoldUpdate = jest.fn().mockResolvedValue({
      id: 'hold-1',
      active: false,
      releasedAt: new Date('2026-07-02T00:00:00.000Z'),
    });

    const prisma = {
      booking: { findFirst: bookingFindFirst },
      operatorBookingEvidenceLegalHold: {
        findFirst: legalHoldFindFirst,
        upsert: legalHoldUpsert,
        update: legalHoldUpdate,
      },
    };

    const svc = new OperatorEvidenceLegalHoldService(prisma as any);
    return { svc, prisma, bookingFindFirst, legalHoldFindFirst, legalHoldUpsert, legalHoldUpdate };
  }

  it('returns false when no active legal hold exists', async () => {
    const { svc, legalHoldFindFirst } = makeService();
    legalHoldFindFirst.mockResolvedValue(null);
    await expect(svc.isActive('org-1', 'booking-1')).resolves.toBe(false);
    expect(legalHoldFindFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', bookingId: 'booking-1', active: true },
      select: { id: true },
    });
  });

  it('rejects legal hold for booking outside tenant', async () => {
    const { svc, bookingFindFirst } = makeService();
    bookingFindFirst.mockResolvedValue(null);
    await expect(
      svc.setActive({ organizationId: 'org-1', bookingId: 'booking-foreign' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts legal hold scoped to organization and booking', async () => {
    const { svc, legalHoldUpsert } = makeService();
    await svc.setActive({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      reason: ' Litigation ',
      setByUserId: 'user-1',
    });
    expect(legalHoldUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'booking-1' },
        create: expect.objectContaining({
          organizationId: 'org-1',
          bookingId: 'booking-1',
          active: true,
          reason: 'Litigation',
        }),
      }),
    );
  });

  it('releases existing legal hold within tenant', async () => {
    const { svc, legalHoldFindFirst, legalHoldUpdate } = makeService();
    legalHoldFindFirst.mockResolvedValue({ id: 'hold-1' });
    const row = await svc.release('org-1', 'booking-1', 'user-2');
    expect(row.active).toBe(false);
    expect(legalHoldUpdate).toHaveBeenCalledWith({
      where: { id: 'hold-1' },
      data: expect.objectContaining({
        active: false,
        releasedByUserId: 'user-2',
      }),
    });
  });

  it('throws when releasing unknown hold', async () => {
    const { svc, legalHoldFindFirst } = makeService();
    legalHoldFindFirst.mockResolvedValue(null);
    await expect(svc.release('org-1', 'booking-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
