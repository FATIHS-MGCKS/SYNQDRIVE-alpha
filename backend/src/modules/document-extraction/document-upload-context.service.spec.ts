import { NotFoundException } from '@nestjs/common';
import { DocumentUploadContextService } from './document-upload-context.service';

describe('DocumentUploadContextService', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      vehicle: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
      fine: { findFirst: jest.fn() },
      orgInvoice: { findFirst: jest.fn() },
      ...prismaOverrides,
    };
    return { svc: new DocumentUploadContextService(prisma as any), prisma };
  }

  it('returns inbox target when no vehicle or context is provided', async () => {
    const { svc } = makeService();
    const target = await svc.resolveUploadTarget({ organizationId: 'org-1' });
    expect(target).toEqual({
      organizationId: 'org-1',
      vehicleId: null,
      contextCandidate: null,
      searchScope: null,
      uploadContextType: null,
      uploadContextId: null,
    });
  });

  it('creates candidate for BOOKING without assigning vehicleId', async () => {
    const { svc, prisma } = makeService({
      booking: { findFirst: jest.fn().mockResolvedValue({ id: 'book-1' }) },
    });

    const target = await svc.resolveUploadTarget({
      organizationId: 'org-1',
      optionalContextType: 'BOOKING',
      optionalContextId: 'book-1',
      sourceSurface: 'rental_ui',
      providedByUserId: 'user-1',
    });

    expect(target.vehicleId).toBeNull();
    expect(target.contextCandidate).toMatchObject({
      entityType: 'BOOKING',
      entityId: 'book-1',
      sourceSurface: 'rental_ui',
      confirmationStatus: 'CANDIDATE',
    });
    expect(prisma.booking.findFirst).toHaveBeenCalled();
  });

  it('resolves explicit vehicleId after org membership check', async () => {
    const { svc } = makeService({
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', licensePlate: 'B-AB 1', vin: null }) },
    });

    const target = await svc.resolveUploadTarget({
      organizationId: 'org-1',
      vehicleId: 'v1',
      sourceSurface: 'vehicle_detail',
    });

    expect(target.vehicleId).toBe('v1');
    expect(target.contextCandidate?.entityType).toBe('VEHICLE');
  });

  it('rejects cross-tenant vehicle context', async () => {
    const { svc } = makeService({
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      svc.resolveUploadTarget({
        organizationId: 'org-1',
        optionalContextType: 'VEHICLE',
        optionalContextId: 'other-org-vehicle',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
