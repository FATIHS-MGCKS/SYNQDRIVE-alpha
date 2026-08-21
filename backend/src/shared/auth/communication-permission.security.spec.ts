import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';
import {
  COMMUNICATION_COMPAT_CONTEXT_KEY,
} from '@shared/decorators/require-communication-permission.decorator';
import {
  VOICE_ASSISTANT_COMPAT_CONTEXT_KEY,
} from '@shared/decorators/require-voice-assistant-permission.decorator';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import type { PrismaService } from '@shared/database/prisma.service';

describe('Communication RBAC security matrix (PermissionsGuard)', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };
  let guard: PermissionsGuard;

  beforeEach(() => {
    guard = new PermissionsGuard(reflector, prisma as unknown as PrismaService);
    jest.clearAllMocks();
  });

  function mockContext(
    required: { module: string; level: 'read' | 'write' | 'manage' },
    user: Record<string, unknown>,
    orgId = 'org-1',
    compat?: Record<string, unknown>,
    voiceCompat?: Record<string, unknown>,
  ) {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PERMISSION_KEY) return required;
      if (key === COMMUNICATION_COMPAT_CONTEXT_KEY) return compat;
      if (key === VOICE_ASSISTANT_COMPAT_CONTEXT_KEY) return voiceCompat;
      return undefined;
    });
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  }

  it('allows MASTER_ADMIN without membership lookup', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'communication',
      level: 'manage',
    });
    const ctx = mockContext(
      { module: 'communication', level: 'manage' },
      { id: 'u-ma', platformRole: 'MASTER_ADMIN' },
    );
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('allows ORG_ADMIN membership role', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'communication',
      level: 'manage',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.ORG_ADMIN,
      permissions: null,
    });
    const ctx = mockContext(
      { module: 'communication', level: 'manage' },
      { id: 'u1', platformRole: 'USER' },
    );
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  it('denies org member without communication permission', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'communication',
      level: 'read',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: { dashboard: { read: true, write: false, manage: false } },
    });
    const ctx = mockContext(
      { module: 'communication', level: 'read' },
      { id: 'u1', platformRole: 'USER' },
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows legacy ai-assistant read for WhatsApp compatibility', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'communication',
      level: 'read',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: { 'ai-assistant': { read: true, write: false, manage: false } },
    });
    const ctx = mockContext(
      { module: 'communication', level: 'read' },
      { id: 'u1', platformRole: 'USER' },
    );
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  it('allows voice operational legacy for worker on flagged routes', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PERMISSION_KEY) return { module: 'communication', level: 'read' };
      if (key === COMMUNICATION_COMPAT_CONTEXT_KEY) return { voiceOperationalLegacy: true };
      return undefined;
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: null,
    });
    const ctx = mockContext(
      { module: 'communication', level: 'read' },
      { id: 'u1', platformRole: 'USER' },
      'org-1',
      { voiceOperationalLegacy: true },
    );
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  it('denies DRIVER on voice operational legacy routes', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PERMISSION_KEY) return { module: 'communication', level: 'read' };
      if (key === COMMUNICATION_COMPAT_CONTEXT_KEY) return { voiceOperationalLegacy: true };
      return undefined;
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.DRIVER,
      permissions: null,
    });
    const ctx = mockContext(
      { module: 'communication', level: 'read' },
      { id: 'u-driver', platformRole: 'USER' },
      'org-1',
      { voiceOperationalLegacy: true },
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies communication.write when only read granted', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'communication',
      level: 'write',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: { communication: { read: true, write: false, manage: false } },
    });
    const ctx = mockContext(
      { module: 'communication', level: 'write' },
      { id: 'u1', platformRole: 'USER' },
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies communication.manage when only write granted', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'communication',
      level: 'manage',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: { communication: { read: false, write: true, manage: false } },
    });
    const ctx = mockContext(
      { module: 'communication', level: 'manage' },
      { id: 'u1', platformRole: 'USER' },
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires voice-assistant.manage for deep admin routes', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PERMISSION_KEY) return { module: 'voice-assistant', level: 'manage' };
      if (key === VOICE_ASSISTANT_COMPAT_CONTEXT_KEY) return { voiceAdminLegacy: true };
      return undefined;
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: { communication: { read: true, write: true, manage: false } },
    });
    const ctx = mockContext(
      { module: 'voice-assistant', level: 'manage' },
      { id: 'u1', platformRole: 'USER' },
      'org-1',
      undefined,
      { voiceAdminLegacy: true },
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant internal ai-assistant from communication permission', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'ai-assistant',
      level: 'read',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: { communication: { read: true, write: true, manage: true } },
    });
    const ctx = mockContext(
      { module: 'ai-assistant', level: 'read' },
      { id: 'u1', platformRole: 'USER' },
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies when no org membership (cross-org)', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'communication',
      level: 'read',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    const ctx = mockContext(
      { module: 'communication', level: 'read' },
      { id: 'u1', platformRole: 'USER' },
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
