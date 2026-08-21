import { MembershipRole } from '@prisma/client';
import { CommunicationPermissionBackfillService } from './communication-permission-backfill.service';

describe('CommunicationPermissionBackfillService', () => {
  const prisma = {
    organizationMembership: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: CommunicationPermissionBackfillService;

  beforeEach(() => {
    service = new CommunicationPermissionBackfillService(prisma as never);
    jest.clearAllMocks();
  });

  it('maps legacy ai-assistant to communication for worker memberships', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm1',
        role: MembershipRole.WORKER,
        permissions: { 'ai-assistant': { read: true, write: true, manage: false } },
      },
    ]);
    prisma.organizationMembership.update.mockResolvedValue({});

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(1);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({
          permissions: expect.objectContaining({
            communication: { read: true, write: true, manage: false },
          }),
        }),
      }),
    );
  });

  it('skips DRIVER memberships', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-driver',
        role: MembershipRole.DRIVER,
        permissions: { 'ai-assistant': { read: true, write: true, manage: true } },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.skippedDriver).toBe(1);
    expect(result.updated).toBe(0);
    expect(prisma.organizationMembership.update).not.toHaveBeenCalled();
  });

  it('does not overwrite explicit communication revoke', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm2',
        role: MembershipRole.WORKER,
        permissions: {
          'ai-assistant': { read: true, write: true, manage: false },
          communication: { read: false, write: false, manage: false },
        },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(0);
    expect(result.skippedExplicitCommunication).toBe(1);
    expect(prisma.organizationMembership.update).not.toHaveBeenCalled();
  });

  it('dryRun does not persist updates', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm3',
        role: MembershipRole.WORKER,
        permissions: { 'ai-assistant': { read: true, write: false, manage: false } },
      },
    ]);

    const result = await service.backfillOrganization('org-1', { dryRun: true });
    expect(result.updated).toBe(1);
    expect(prisma.organizationMembership.update).not.toHaveBeenCalled();
  });

  it('repeated backfill is safe (idempotent)', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm4',
        role: MembershipRole.WORKER,
        permissions: {
          'ai-assistant': { read: true, write: false, manage: false },
          communication: { read: true, write: false, manage: false },
          'voice-assistant': { read: true, write: false, manage: false },
        },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(0);
  });
});
