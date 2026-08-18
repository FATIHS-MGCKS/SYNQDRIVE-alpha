import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import {
  MasterAdminAuditAction,
  MASTER_ADMIN_AUDIT_DOMAIN,
} from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import {
  destroySmokeCredential,
  generateSmokePassword,
  readSmokeCredential,
  resolveSmokeStateFilePath,
  writeSmokeCredential,
} from './master-admin-smoke-credential.store';
import {
  MASTER_ADMIN_SMOKE_AUDIT_REASON,
  MASTER_ADMIN_SMOKE_CREATED_BY,
  MASTER_ADMIN_SMOKE_DEFAULT_TTL_HOURS,
  MASTER_ADMIN_SMOKE_EMAIL,
  MASTER_ADMIN_SMOKE_PURPOSE,
  MASTER_ADMIN_SMOKE_STATE_VERSION,
  MASTER_ADMIN_SMOKE_USER_NAME,
} from './master-admin-smoke-lifecycle.constants';
import {
  assertSmokeProvisioningGate,
  resolveSmokeTtlHours,
} from './master-admin-smoke-lifecycle.policy';
import type {
  MasterAdminSmokeCleanupResult,
  MasterAdminSmokeLifecycleState,
  MasterAdminSmokeSetupResult,
  MasterAdminSmokeStatusResult,
} from './master-admin-smoke-lifecycle.types';

@Injectable()
export class MasterAdminSmokeLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly masterAdminAudit: MasterAdminAuditService,
    private readonly config: ConfigService,
  ) {}

  async setup(input: { confirmProductionSmoke: boolean }): Promise<MasterAdminSmokeSetupResult> {
    assertSmokeProvisioningGate({
      confirmProductionSmoke: input.confirmProductionSmoke,
      nodeEnv: this.config.get<string>('app.nodeEnv'),
    });

    const existing = await this.prisma.user.findUnique({
      where: { email: MASTER_ADMIN_SMOKE_EMAIL },
    });

    if (existing?.status === UserStatus.ACTIVE && existing.platformRole === UserPlatformRole.MASTER_ADMIN) {
      const state = this.readStateFile();
      if (state && new Date(state.expiresAt).getTime() > Date.now()) {
        throw new BadRequestException({
          code: 'SMOKE_ACCOUNT_ALREADY_ACTIVE',
          message:
            'An active master-admin smoke account already exists. Run cleanup before setup.',
          userId: existing.id,
          expiresAt: state.expiresAt,
        });
      }
      await this.cleanupInternal(existing.id, { audit: true, reasonSuffix: 'stale account replaced' });
    } else if (existing && existing.status !== UserStatus.INACTIVE) {
      throw new BadRequestException({
        code: 'SMOKE_ACCOUNT_CONFLICT',
        message:
          'Smoke email is bound to a non-inactive user. Manual governance review required before reuse.',
        userId: existing.id,
        status: existing.status,
      });
    }

    const password = generateSmokePassword();
    this.passwordPolicy.assertAcceptablePassword(password);
    const passwordHash = await bcrypt.hash(password, 10);
    const ttlHours = resolveSmokeTtlHours() || MASTER_ADMIN_SMOKE_DEFAULT_TTL_HOURS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const environment = this.config.get<string>('app.nodeEnv') ?? process.env.NODE_ENV ?? 'unknown';

    let userId: string;
    let reactivated = false;

    if (existing) {
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: MASTER_ADMIN_SMOKE_USER_NAME,
          platformRole: UserPlatformRole.MASTER_ADMIN,
          status: UserStatus.ACTIVE,
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
      });
      userId = updated.id;
      reactivated = true;
    } else {
      const created = await this.prisma.user.create({
        data: {
          email: MASTER_ADMIN_SMOKE_EMAIL,
          name: MASTER_ADMIN_SMOKE_USER_NAME,
          platformRole: UserPlatformRole.MASTER_ADMIN,
          status: UserStatus.ACTIVE,
          passwordHash,
          mustChangePassword: false,
        },
      });
      userId = created.id;
    }

    const state: MasterAdminSmokeLifecycleState = {
      version: MASTER_ADMIN_SMOKE_STATE_VERSION,
      userId,
      email: MASTER_ADMIN_SMOKE_EMAIL,
      purpose: MASTER_ADMIN_SMOKE_PURPOSE,
      temporary: true,
      createdBy: MASTER_ADMIN_SMOKE_CREATED_BY,
      environment,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    this.writeStateFile(state);

    const credentialFilePath = writeSmokeCredential(password);

    await this.masterAdminAudit.record({
      auditAction: MasterAdminAuditAction.TEMP_MASTER_ADMIN_CREATED,
      actorUserId: undefined,
      actorPlatformRole: 'SYSTEM',
      entityId: userId,
      description: 'Temporary master-admin smoke account provisioned',
      reasonCode: MASTER_ADMIN_SMOKE_AUDIT_REASON,
      correlationId: `master-admin-smoke-setup:${userId}:${randomUUID()}`,
      metadata: {
        auditActor: MASTER_ADMIN_SMOKE_CREATED_BY,
        purpose: MASTER_ADMIN_SMOKE_PURPOSE,
        temporary: true,
        environment,
        expiresAt: state.expiresAt,
        email: MASTER_ADMIN_SMOKE_EMAIL,
        reactivated,
      },
    });

    return {
      userId,
      email: MASTER_ADMIN_SMOKE_EMAIL,
      expiresAt: state.expiresAt,
      credentialFilePath,
      reactivated,
    };
  }

  async status(): Promise<MasterAdminSmokeStatusResult> {
    const state = this.readStateFile();
    const user = await this.prisma.user.findUnique({
      where: { email: MASTER_ADMIN_SMOKE_EMAIL },
    });

    let activeSessions = 0;
    if (user) {
      activeSessions = await this.prisma.refreshToken.count({
        where: {
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
    }

    const expired = state ? new Date(state.expiresAt).getTime() <= Date.now() : false;

    return {
      configured: Boolean(state || user),
      state,
      user: user
        ? {
            id: user.id,
            email: user.email,
            status: user.status,
            platformRole: user.platformRole,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          }
        : null,
      activeSessions,
      expired,
      credentialFilePresent: readSmokeCredential() !== null,
    };
  }

  async cleanup(input: {
    confirmProductionSmoke: boolean;
    reason?: string;
  }): Promise<MasterAdminSmokeCleanupResult> {
    assertSmokeProvisioningGate({
      confirmProductionSmoke: input.confirmProductionSmoke,
      nodeEnv: this.config.get<string>('app.nodeEnv'),
    });

    const user = await this.prisma.user.findUnique({
      where: { email: MASTER_ADMIN_SMOKE_EMAIL },
    });

    if (!user) {
      const credentialDestroyed = destroySmokeCredential();
      const stateCleared = this.clearStateFile();
      return {
        userId: null,
        email: MASTER_ADMIN_SMOKE_EMAIL,
        sessionsRevoked: 0,
        accountDisabled: false,
        credentialDestroyed,
        stateCleared,
      };
    }

    return this.cleanupInternal(user.id, {
      audit: true,
      reasonSuffix: input.reason,
    });
  }

  async verifyLoginBlocked(): Promise<{ loginBlocked: boolean; status: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { email: MASTER_ADMIN_SMOKE_EMAIL },
      select: { status: true, passwordHash: true },
    });
    if (!user) return { loginBlocked: true, status: null };
    if (user.status !== UserStatus.ACTIVE) return { loginBlocked: true, status: user.status };
    const password = readSmokeCredential();
    if (!password || !user.passwordHash) {
      return { loginBlocked: false, status: user.status };
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    return { loginBlocked: !matches, status: user.status };
  }

  async verifyPostCleanup(): Promise<{
    ok: boolean;
    loginBlocked: boolean;
    activeSessions: number;
    credentialDestroyed: boolean;
    stateCleared: boolean;
    duplicateActiveSmokeAccounts: number;
  }> {
    const status = await this.status();
    const login = await this.verifyLoginBlocked();
    const duplicateActiveSmokeAccounts = await this.prisma.user.count({
      where: {
        email: MASTER_ADMIN_SMOKE_EMAIL,
        status: UserStatus.ACTIVE,
        platformRole: UserPlatformRole.MASTER_ADMIN,
      },
    });

    const ok =
      login.loginBlocked &&
      status.activeSessions === 0 &&
      !status.credentialFilePresent &&
      !status.state &&
      duplicateActiveSmokeAccounts === 0;

    return {
      ok,
      loginBlocked: login.loginBlocked,
      activeSessions: status.activeSessions,
      credentialDestroyed: !status.credentialFilePresent,
      stateCleared: !status.state,
      duplicateActiveSmokeAccounts,
    };
  }

  private async cleanupInternal(
    userId: string,
    input: { audit: boolean; reasonSuffix?: string },
  ): Promise<MasterAdminSmokeCleanupResult> {
    const sessionsRevoked = await this.refreshTokens.revokeAllActiveForUser(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.INACTIVE,
        sessionVersion: { increment: 1 },
      },
    });

    const credentialDestroyed = destroySmokeCredential();
    const stateCleared = this.clearStateFile();

    if (input.audit) {
      const environment = this.config.get<string>('app.nodeEnv') ?? process.env.NODE_ENV ?? 'unknown';
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.TEMP_MASTER_ADMIN_DISABLED,
        actorUserId: undefined,
        actorPlatformRole: 'SYSTEM',
        entityId: userId,
        description: 'Temporary master-admin smoke account disabled',
        reasonCode: input.reasonSuffix
          ? `${MASTER_ADMIN_SMOKE_AUDIT_REASON} (${input.reasonSuffix})`
          : MASTER_ADMIN_SMOKE_AUDIT_REASON,
        correlationId: `master-admin-smoke-cleanup:${userId}:${randomUUID()}`,
        metadata: {
          auditActor: MASTER_ADMIN_SMOKE_CREATED_BY,
          purpose: MASTER_ADMIN_SMOKE_PURPOSE,
          temporary: true,
          environment,
          result: 'INACTIVE',
          sessionsRevoked,
          auditDomain: MASTER_ADMIN_AUDIT_DOMAIN,
        },
        level: 'INFO',
      });
    }

    return {
      userId,
      email: MASTER_ADMIN_SMOKE_EMAIL,
      sessionsRevoked,
      accountDisabled: true,
      credentialDestroyed,
      stateCleared,
    };
  }

  private readStateFile(): MasterAdminSmokeLifecycleState | null {
    const filePath = resolveSmokeStateFilePath();
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as MasterAdminSmokeLifecycleState;
      if (parsed?.email !== MASTER_ADMIN_SMOKE_EMAIL) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeStateFile(state: MasterAdminSmokeLifecycleState): void {
    const filePath = resolveSmokeStateFilePath();
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // ignore
    }
  }

  private clearStateFile(): boolean {
    const filePath = resolveSmokeStateFilePath();
    if (!fs.existsSync(filePath)) return false;
    try {
      fs.rmSync(filePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }
}
