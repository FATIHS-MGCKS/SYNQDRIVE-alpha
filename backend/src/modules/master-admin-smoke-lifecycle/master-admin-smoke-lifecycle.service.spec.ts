import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserPlatformRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  destroySmokeCredential,
  resolveSmokeCredentialFilePath,
  resolveSmokeStateFilePath,
} from './master-admin-smoke-credential.store';
import { MASTER_ADMIN_SMOKE_EMAIL } from './master-admin-smoke-lifecycle.constants';
import { MasterAdminSmokeLifecycleService } from './master-admin-smoke-lifecycle.service';

describe('MasterAdminSmokeLifecycleService', () => {
  const credentialPath = path.join(os.tmpdir(), `smoke-cred-test-${process.pid}.cred`);
  const statePath = path.join(os.tmpdir(), `smoke-state-test-${process.pid}.json`);
  const originalEnv = { ...process.env };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    refreshToken: {
      count: jest.fn(),
    },
  } as unknown as PrismaService;

  const refreshTokens = {
    revokeAllActiveForUser: jest.fn().mockResolvedValue(2),
  } as unknown as RefreshTokenService;

  const passwordPolicy = new PasswordPolicyService();
  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as MasterAdminAuditService;

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'app.nodeEnv') return 'test';
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new MasterAdminSmokeLifecycleService(
    prisma,
    refreshTokens,
    passwordPolicy,
    masterAdminAudit,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED: 'true',
      MASTER_ADMIN_SMOKE_CREDENTIAL_FILE: credentialPath,
      MASTER_ADMIN_SMOKE_STATE_FILE: statePath,
    };
    destroySmokeCredential();
    if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
  });

  afterAll(() => {
    process.env = originalEnv;
    destroySmokeCredential();
    if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
  });

  it('refuses duplicate active smoke account', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: MASTER_ADMIN_SMOKE_EMAIL,
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        userId: 'user-1',
        email: MASTER_ADMIN_SMOKE_EMAIL,
        purpose: 'master-admin-smoke',
        temporary: true,
        createdBy: 'ops-smoke-lifecycle',
        environment: 'test',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      { mode: 0o600 },
    );

    await expect(service.setup({ confirmProductionSmoke: false })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates canonical MASTER_ADMIN account and audit event without logging password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'smoke-user-1',
      ...data,
    }));

    const result = await service.setup({ confirmProductionSmoke: false });
    expect(result.userId).toBe('smoke-user-1');
    expect(result.email).toBe(MASTER_ADMIN_SMOKE_EMAIL);
    expect(fs.existsSync(resolveSmokeCredentialFilePath())).toBe(true);

    const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.platformRole).toBe(UserPlatformRole.MASTER_ADMIN);
    expect(createCall.data.passwordHash).toBeTruthy();
    expect(createCall.data.passwordHash).not.toEqual(expect.stringMatching(/^[A-Za-z0-9_-]{20,}$/));

    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.TEMP_MASTER_ADMIN_CREATED,
      }),
    );

    const auditPayload = JSON.stringify((masterAdminAudit.record as jest.Mock).mock.calls[0][0]);
    expect(auditPayload.toLowerCase()).not.toContain('password');
  });

  it('cleanup disables account, revokes sessions, and records audit event', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'smoke-user-1',
      email: MASTER_ADMIN_SMOKE_EMAIL,
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    fs.writeFileSync(credentialPath, 'temporary-test-password-value', { mode: 0o600 });
    fs.writeFileSync(statePath, JSON.stringify({ email: MASTER_ADMIN_SMOKE_EMAIL }), { mode: 0o600 });

    const result = await service.cleanup({
      confirmProductionSmoke: false,
      reason: 'unit test',
    });

    expect(refreshTokens.revokeAllActiveForUser).toHaveBeenCalledWith('smoke-user-1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'smoke-user-1' },
        data: expect.objectContaining({ status: UserStatus.INACTIVE }),
      }),
    );
    expect(result.accountDisabled).toBe(true);
    expect(result.credentialDestroyed).toBe(true);
    expect(result.stateCleared).toBe(true);
    expect(masterAdminAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: MasterAdminAuditAction.TEMP_MASTER_ADMIN_DISABLED,
      }),
    );
  });

  it('verifyPostCleanup passes after inactive account and destroyed credentials', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'smoke-user-1',
      email: MASTER_ADMIN_SMOKE_EMAIL,
      status: UserStatus.INACTIVE,
      platformRole: UserPlatformRole.MASTER_ADMIN,
      lastLoginAt: null,
      passwordHash: await bcrypt.hash('old-password', 4),
    });
    (prisma.refreshToken.count as jest.Mock).mockResolvedValue(0);
    (prisma.user.count as jest.Mock).mockResolvedValue(0);

    const verification = await service.verifyPostCleanup();
    expect(verification.ok).toBe(true);
    expect(verification.loginBlocked).toBe(true);
    expect(verification.activeSessions).toBe(0);
  });
});
