import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperatorAppService } from './operator-app.service';
import * as permissionUtil from '@shared/auth/permission.util';

describe('OperatorAppService', () => {
  const bookings = {
    findDetail: jest.fn(),
  };
  const prisma = {
    customerDocument: { findMany: jest.fn() },
    customer: { findFirst: jest.fn(), findMany: jest.fn() },
    bookingHandoverSession: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
  };
  const customerDocuments = {
    getDocument: jest.fn(),
  };
  const generatedDocuments = {
    getById: jest.fn(),
    getDownload: jest.fn(),
  };
  const preview = {
    issueCustomerDocumentPreviewToken: jest.fn(),
    issueGeneratedDocumentPreviewToken: jest.fn(),
    verifyToken: jest.fn(),
  };
  const audit = {
    logSensitiveDocumentView: jest.fn(),
  };
  const config = {
    get: jest.fn(() => 'uploads'),
  };

  const service = new OperatorAppService(
    prisma as never,
    bookings as never,
    customerDocuments as never,
    generatedDocuments as never,
    preview as never,
    audit as never,
    config as never,
  );

  const workerActor = { userId: 'user-worker', membershipRole: 'STAFF' };
  const verifierActor = { userId: 'user-verifier', membershipRole: 'ADMIN' };

  const fullDetail = {
    core: {
      bookingId: 'booking-1',
      bookingNumber: 'B-100',
      status: 'CONFIRMED',
      statusEnum: 'CONFIRMED',
      startDate: '2026-07-20T08:00:00.000Z',
      endDate: '2026-07-25T18:00:00.000Z',
      pickupStationId: 's1',
      returnStationId: 's2',
      kmIncluded: 500,
    },
    customer: {
      customerId: 'customer-1',
      fullName: 'Max Mustermann',
      email: 'max@example.com',
      phone: '+491701234567',
      identityStatus: 'VERIFIED',
      licenseStatus: 'VERIFIED',
      riskLevel: 'HIGH',
      openInvoiceCount: 3,
      notes: 'private note',
    },
    vehicle: {
      vehicleId: 'vehicle-1',
      displayName: 'VW Golf',
      licensePlate: 'M-AB 123',
      odometerKm: 12000,
      fuelPercent: 80,
      evSoc: null,
      rentalBlocked: false,
    },
    stations: {
      pickup: { stationId: 's1', name: 'Berlin', handoverInstructions: 'Ring bell' },
      return: { stationId: 's2', name: 'Munich', returnInstructions: 'Drop key' },
    },
    documents: {
      slots: [
        {
          documentType: 'RENTAL_CONTRACT',
          status: 'generated',
          available: true,
          documentId: 'doc-1',
        },
      ],
    },
    handover: { pickup: null, return: null },
    health: { rentalBlocked: false, blockingReasons: [] },
    finance: { paymentStatus: 'PAID' },
    payments: [{ id: 'pay-1' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    bookings.findDetail.mockResolvedValue(fullDetail);
    prisma.customerDocument.findMany.mockResolvedValue([]);
  });

  it('returns minimized booking context for worker without full document ids', async () => {
    jest
      .spyOn(permissionUtil, 'assertMembershipPermission')
      .mockRejectedValue(new ForbiddenException());

    const ctx = await service.getBookingContext('org-1', 'booking-1', 'PICKUP', workerActor);

    expect(ctx.customer.displayName).toBe('Max M.');
    expect(ctx.bookingDocumentSlots[0].documentId).toBeNull();
    expect(ctx).not.toHaveProperty('finance');
    expect(ctx).not.toHaveProperty('payments');
    expect((ctx.customer as { riskLevel?: string }).riskLevel).toBeUndefined();
  });

  it('exposes document ids and full customer name for authorized verifier', async () => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);

    const ctx = await service.getBookingContext(
      'org-1',
      'booking-1',
      'DOCUMENT_CHECK',
      verifierActor,
    );

    expect(ctx.customer.displayName).toBe('Max Mustermann');
    expect(ctx.bookingDocumentSlots[0].documentId).toBe('doc-1');
    expect(ctx.customerDocumentSlots).toEqual([]);
  });

  it('rejects foreign organization booking lookup', async () => {
    bookings.findDetail.mockResolvedValue(null);
    await expect(
      service.getBookingContext('org-foreign', 'booking-1', 'PICKUP', workerActor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('audits sensitive customer document preview grant', async () => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
    customerDocuments.getDocument.mockResolvedValue({
      type: 'ID_CARD',
      fileKey: '/uploads/org/customer/doc.pdf',
      mimeType: 'application/pdf',
      originalFileName: 'id.pdf',
    });
    preview.issueCustomerDocumentPreviewToken.mockReturnValue({
      token: 'tok',
      expiresAt: new Date('2026-07-25T12:00:00.000Z'),
    });

    const grant = await service.grantCustomerDocumentPreview(
      'org-1',
      'customer-1',
      'doc-1',
      'DOCUMENT_CHECK',
      verifierActor,
    );

    expect(audit.logSensitiveDocumentView).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: verifierActor.userId,
        kind: 'CUSTOMER_ID_DOCUMENT',
        documentId: 'doc-1',
      }),
    );
    expect(grant.audited).toBe(true);
    expect(grant.previewPath).toContain('/operator/preview/');
  });

  it('denies preview grant for worker without customers.read', async () => {
    jest
      .spyOn(permissionUtil, 'assertMembershipPermission')
      .mockRejectedValue(new ForbiddenException());

    await expect(
      service.grantCustomerDocumentPreview(
        'org-1',
        'customer-1',
        'doc-1',
        'DOCUMENT_CHECK',
        workerActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.logSensitiveDocumentView).not.toHaveBeenCalled();
  });

  it('resumes handover session scoped to organization', async () => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
    prisma.bookingHandoverSession.findFirst.mockResolvedValue({
      id: 'session-1',
      bookingId: 'booking-1',
      vehicleId: 'vehicle-1',
      kind: 'PICKUP',
      status: 'DRAFT',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const resume = await service.getHandoverSessionResume('org-1', 'session-1', workerActor);

    expect(resume).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        bookingId: 'booking-1',
        editable: true,
        expired: false,
      }),
    );
    expect(prisma.bookingHandoverSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1', organizationId: 'org-1' },
      }),
    );
  });

  it('rejects foreign organization handover session resume', async () => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
    prisma.bookingHandoverSession.findFirst.mockResolvedValue(null);

    await expect(
      service.getHandoverSessionResume('org-foreign', 'session-1', workerActor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks cancelled handover session as non-editable', async () => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
    prisma.bookingHandoverSession.findFirst.mockResolvedValue({
      id: 'session-1',
      bookingId: 'booking-1',
      vehicleId: 'vehicle-1',
      kind: 'PICKUP',
      status: 'CANCELLED',
      expiresAt: null,
    });

    const resume = await service.getHandoverSessionResume('org-1', 'session-1', workerActor);
    expect(resume.editable).toBe(false);
    expect(resume.lifecycleStatus).toBe('CANCELLED');
  });

  it('rejects foreign organization vehicle resume', async () => {
    jest.spyOn(permissionUtil, 'assertMembershipPermission').mockResolvedValue(undefined);
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      service.getVehicleResume('org-foreign', 'vehicle-1', workerActor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
