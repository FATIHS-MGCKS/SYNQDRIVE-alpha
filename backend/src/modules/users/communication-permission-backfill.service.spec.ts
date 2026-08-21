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
    prisma.organizationMembership.update.mockResolvedValue({});
  });

  it('A. explicit communication + missing voice-assistant backfills voice-assistant only', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-a',
        role: MembershipRole.WORKER,
        permissions: {
          'ai-assistant': { read: true, write: true, manage: false },
          communication: { read: true, write: true, manage: false },
        },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(1);
    expect(result.skippedExplicitCommunication).toBe(1);
    expect(result.skippedExplicitVoiceAssistant).toBe(0);
    expect(result.backfilledCommunication).toBe(0);
    expect(result.backfilledVoiceAssistant).toBe(1);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm-a' },
        data: expect.objectContaining({
          permissions: expect.objectContaining({
            communication: { read: true, write: true, manage: false },
            'voice-assistant': { read: true, write: true, manage: false },
          }),
        }),
      }),
    );
  });

  it('B. explicit voice-assistant + missing communication backfills communication only', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-b',
        role: MembershipRole.WORKER,
        permissions: {
          'ai-assistant': { read: true, write: true, manage: false },
          'voice-assistant': { read: true, write: false, manage: false },
        },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(1);
    expect(result.skippedExplicitVoiceAssistant).toBe(1);
    expect(result.skippedExplicitCommunication).toBe(0);
    expect(result.backfilledCommunication).toBe(1);
    expect(result.backfilledVoiceAssistant).toBe(0);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: expect.objectContaining({
            communication: { read: true, write: true, manage: false },
            'voice-assistant': { read: true, write: false, manage: false },
          }),
        }),
      }),
    );
  });

  it('C. explicit communication revoke + missing voice-assistant preserves revoke and backfills voice-assistant', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-c',
        role: MembershipRole.WORKER,
        permissions: {
          'ai-assistant': { read: true, write: true, manage: false },
          communication: { read: false, write: false, manage: false },
        },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(1);
    expect(result.skippedExplicitCommunication).toBe(1);
    expect(result.backfilledVoiceAssistant).toBe(1);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: expect.objectContaining({
            communication: { read: false, write: false, manage: false },
            'voice-assistant': { read: true, write: true, manage: false },
          }),
        }),
      }),
    );
  });

  it('D. explicit voice-assistant revoke + missing communication preserves revoke and backfills communication', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-d',
        role: MembershipRole.WORKER,
        permissions: {
          'ai-assistant': { read: true, write: true, manage: false },
          'voice-assistant': { read: false, write: false, manage: false },
        },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(1);
    expect(result.skippedExplicitVoiceAssistant).toBe(1);
    expect(result.backfilledCommunication).toBe(1);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: expect.objectContaining({
            communication: { read: true, write: true, manage: false },
            'voice-assistant': { read: false, write: false, manage: false },
          }),
        }),
      }),
    );
  });

  it('E. both explicit keys produce no mutation', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-e',
        role: MembershipRole.WORKER,
        permissions: {
          'ai-assistant': { read: true, write: true, manage: true },
          communication: { read: true, write: false, manage: false },
          'voice-assistant': { read: false, write: false, manage: false },
        },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(0);
    expect(result.skippedExplicitCommunication).toBe(1);
    expect(result.skippedExplicitVoiceAssistant).toBe(1);
    expect(prisma.organizationMembership.update).not.toHaveBeenCalled();
  });

  it('F. neither explicit key backfills both domains from legacy ai-assistant', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-f',
        role: MembershipRole.WORKER,
        permissions: { 'ai-assistant': { read: true, write: true, manage: false } },
      },
    ]);

    const result = await service.backfillOrganization('org-1');
    expect(result.updated).toBe(1);
    expect(result.skippedExplicitCommunication).toBe(0);
    expect(result.skippedExplicitVoiceAssistant).toBe(0);
    expect(result.backfilledCommunication).toBe(1);
    expect(result.backfilledVoiceAssistant).toBe(1);
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: expect.objectContaining({
            communication: { read: true, write: true, manage: false },
            'voice-assistant': { read: true, write: true, manage: false },
          }),
        }),
      }),
    );
  });

  it('G. repeated execution remains idempotent', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-g',
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
    expect(prisma.organizationMembership.update).not.toHaveBeenCalled();
  });

  it('H. DRIVER remains untouched', async () => {
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

  it('never infers communication.manage from ai-assistant manage alone', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-manage',
        role: MembershipRole.WORKER,
        permissions: { 'ai-assistant': { read: false, write: false, manage: true } },
      },
    ]);

    await service.backfillOrganization('org-1');
    expect(prisma.organizationMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: expect.objectContaining({
            communication: { read: true, write: true, manage: false },
            'voice-assistant': { read: true, write: true, manage: true },
          }),
        }),
      }),
    );
  });

  it('dryRun does not persist updates', async () => {
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'm-dry',
        role: MembershipRole.WORKER,
        permissions: { 'ai-assistant': { read: true, write: false, manage: false } },
      },
    ]);

    const result = await service.backfillOrganization('org-1', { dryRun: true });
    expect(result.updated).toBe(1);
    expect(prisma.organizationMembership.update).not.toHaveBeenCalled();
  });
});
