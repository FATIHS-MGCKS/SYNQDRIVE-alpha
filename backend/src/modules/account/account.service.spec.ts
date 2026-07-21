import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AccountService } from './account.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';

describe('AccountService', () => {
  const userId = 'user-1';
  const orgId = 'org-1';
  const membershipId = 'mem-1';

  const baseUser = {
    id: userId,
    email: 'user@example.com',
    firstName: 'Max',
    lastName: 'Mustermann',
    name: 'Max Mustermann',
    phone: null,
    mobile: null,
    avatarUrl: null,
    language: 'de',
    timezone: 'Europe/Berlin',
    dateFormat: 'DD.MM.YYYY',
    passwordHash: '$2b$10$hash',
    status: 'ACTIVE',
    lastLoginAt: new Date('2026-06-01T10:00:00Z'),
    lastLoginIp: '127.0.0.1',
    lastLoginDevice: 'Chrome',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
  };

  const baseMembership = {
    id: membershipId,
    userId,
    organizationId: orgId,
    role: 'ORG_ADMIN',
    roleLabel: null,
    department: 'Ops',
    position: 'Manager',
    stationScope: 'ALL',
    permissions: { bookings: { read: true, write: true } },
    status: 'ACTIVE',
    organization: {
      id: orgId,
      companyName: 'Test GmbH',
      shortCode: 'test-gmbh',
      status: 'ACTIVE',
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
    },
    userAccountPreference: {
      upsert: jest.fn(),
    },
    userNotificationPreference: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      upsert: jest.fn(),
    },
    station: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    ),
  } as unknown as PrismaService;

  const audit = { record: jest.fn().mockResolvedValue('log-1') } as unknown as AuditService;

  const refreshTokens = {
    listSessionsForUser: jest.fn().mockResolvedValue([]),
    resolveCurrentSessionId: jest.fn().mockReturnValue(null),
    revokeOtherSessionsForUser: jest.fn().mockResolvedValue({ revoked: 2, keptSessionId: 's1' }),
    revokeSessionById: jest.fn().mockResolvedValue(true),
  } as unknown as RefreshTokenService;

  const sessionPolicy = {
    enqueueInTransaction: jest.fn().mockResolvedValue({ intentIds: ['intent-1'], scopes: [] }),
    processIntents: jest.fn().mockResolvedValue([]),
  } as unknown as IamSessionPolicyService;

  const service = new AccountService(prisma, audit, refreshTokens, sessionPolicy);

  function mockContext() {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue(baseMembership);
    (prisma.userAccountPreference.upsert as jest.Mock).mockResolvedValue({
      userId,
      organizationId: orgId,
      defaultStationId: null,
      defaultLandingPage: null,
    });
    (prisma.userNotificationPreference.findMany as jest.Mock).mockResolvedValue(
      Object.values(NotificationCategory).map((category) => ({
        category,
        inApp: true,
        email: true,
        push: false,
        sms: false,
        criticalOnly: false,
      })),
    );
    (prisma.station.count as jest.Mock).mockResolvedValue(0);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext();
  });

  it('GET /account/me returns full view model', async () => {
    const result = await service.getMe(userId, orgId);

    expect(result.user.email).toBe('user@example.com');
    expect(result.organization.id).toBe(orgId);
    expect(result.membership.role).toBe('ORG_ADMIN');
    expect(result.preferences.language).toBe('de');
    expect(result.notifications.length).toBeGreaterThan(0);
    expect(result.security.twoFactorAvailable).toBe(false);
    expect(result.security.passkeysAvailable).toBe(false);
    expect(result.accountHealth.score).toBeGreaterThanOrEqual(0);
  });

  it('updates own profile fields', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({
      ...baseUser,
      phone: '+491234',
    });

    await service.updateProfile(
      userId,
      orgId,
      { phone: '+491234' },
      { route: 'PATCH /account/me/profile' },
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId },
        data: expect.objectContaining({ phone: '+491234' }),
      }),
    );
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects empty firstName on profile patch', async () => {
    await expect(
      service.updateProfile(userId, orgId, { firstName: '   ' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves preferences with org-scoped default station', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue({ id: 'st-1', organizationId: orgId });
    (prisma.user.update as jest.Mock).mockResolvedValue(baseUser);
    (prisma.userAccountPreference.upsert as jest.Mock).mockResolvedValue({
      defaultStationId: 'st-1',
      defaultLandingPage: 'dashboard',
    });

    await service.updatePreferences(
      userId,
      orgId,
      { defaultStationId: 'st-1', defaultLandingPage: 'dashboard' },
      {},
    );

    expect(prisma.station.findFirst).toHaveBeenCalledWith({
      where: { id: 'st-1', organizationId: orgId },
    });
    expect(prisma.userAccountPreference.upsert).toHaveBeenCalled();
  });

  it('rejects defaultStationId from another organization', async () => {
    (prisma.station.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.updatePreferences(userId, orgId, { defaultStationId: 'foreign-st' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists notification preferences', async () => {
    await service.updateNotifications(
      userId,
      orgId,
      [{ category: NotificationCategory.TASKS, email: false, inApp: true }],
      {},
    );

    expect(prisma.userNotificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId_category: {
            userId,
            organizationId: orgId,
            category: NotificationCategory.TASKS,
          },
        },
      }),
    );
  });

  it('blocks disabling all SECURITY notification channels', async () => {
    await expect(
      service.updateNotifications(
        userId,
        orgId,
        [{ category: NotificationCategory.SECURITY, inApp: false, email: false }],
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires currentPassword for password change', async () => {
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    await expect(
      service.changePassword(
        userId,
        orgId,
        {
          currentPassword: 'wrong',
          newPassword: 'newpassword1',
          confirmPassword: 'newpassword1',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects passwords shorter than policy minimum', async () => {
    await expect(
      service.changePassword(
        userId,
        orgId,
        {
          currentPassword: 'oldpassword1',
          newPassword: 'short',
          confirmPassword: 'short',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes password when currentPassword is valid', async () => {
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);
    (prisma.user.update as jest.Mock).mockResolvedValue(baseUser);

    const result = await service.changePassword(
      userId,
      orgId,
      {
        currentPassword: 'oldpassword1',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
        revokeOtherSessions: true,
      },
      {},
    );

    expect(result.message).toContain('success');
    expect(sessionPolicy.enqueueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'PASSWORD_CHANGED', userId }),
    );
    expect(sessionPolicy.processIntents).toHaveBeenCalled();
  });

  it('rejects identical new and current password', async () => {
    await expect(
      service.changePassword(
        userId,
        orgId,
        {
          currentPassword: 'same',
          newPassword: 'same',
          confirmPassword: 'same',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokeOtherSessions only affects own user context', async () => {
    const result = await service.revokeOtherSessions(userId, orgId, 's1', {});

    expect(refreshTokens.revokeOtherSessionsForUser).toHaveBeenCalledWith(userId, 's1');
    expect(result.revoked).toBe(2);
  });

  it('rejects inactive user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, status: 'INACTIVE' });

    await expect(service.getMe(userId, orgId)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
