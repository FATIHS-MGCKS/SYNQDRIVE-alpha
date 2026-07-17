import { NotFoundException } from '@nestjs/common';
import { DocumentUploadContextService } from './document-upload-context.service';

describe('DocumentUploadContextService', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      vehicle: {
        findFirst: jest.fn(),
        ...prismaOverrides,
      },
    };
    return new DocumentUploadContextService(prisma as any);
  }

  it('returns inbox target when no vehicle or context is provided', async () => {
    const svc = makeService();
    const target = await svc.resolveUploadTarget({ organizationId: 'org-1' });
    expect(target).toEqual({
      organizationId: 'org-1',
      vehicleId: null,
      uploadContextType: null,
      uploadContextId: null,
    });
  });

  it('resolves explicit vehicleId after org membership check', async () => {
    const svc = makeService({
      findFirst: jest.fn().mockResolvedValue({ id: 'v1' }),
    });

    const target = await svc.resolveUploadTarget({
      organizationId: 'org-1',
      vehicleId: 'v1',
    });

    expect(target.vehicleId).toBe('v1');
    expect(target.uploadContextType).toBe('VEHICLE');
  });

  it('resolves VEHICLE optional context into vehicleId', async () => {
    const svc = makeService({
      findFirst: jest.fn().mockResolvedValue({ id: 'v2' }),
    });

    const target = await svc.resolveUploadTarget({
      organizationId: 'org-1',
      optionalContextType: 'vehicle',
      optionalContextId: 'v2',
    });

    expect(target).toEqual({
      organizationId: 'org-1',
      vehicleId: 'v2',
      uploadContextType: 'VEHICLE',
      uploadContextId: 'v2',
    });
  });

  it('rejects cross-tenant vehicle context', async () => {
    const svc = makeService({
      findFirst: jest.fn().mockResolvedValue(null),
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
