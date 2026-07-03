import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  NotificationCategory,
  OrganizationMembership,
  Organization,
  User,
  UserNotificationPreference,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { AccountTwoFactorService } from './two-factor/account-two-factor.service';
import {
  NOTIFICATION_CATEGORY_META,
  NOTIFICATION_CATEGORY_ORDER,
} from './account-notification.defaults';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UpdateMyPreferencesDto } from './dto/update-my-preferences.dto';
import { NotificationPreferenceItemDto } from './dto/update-my-notification-preferences.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import {
  AccountMeDto,
  AccountSessionDto,
  AccountSessionStatus,
} from './types/account.types';

const ROLE_DISPLAY: Record<string, string> = {
  ORG_ADMIN: 'Org Admin',
  SUB_ADMIN: 'Sub Admin',
  WORKER: 'Worker',
  DRIVER: 'Driver',
};

const IANA_TZ_RE = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+$/;

type MembershipWithOrg = OrganizationMembership & { organization: Organization };

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly twoFactor: AccountTwoFactorService,
  ) {}

  async getMe(userId: string, jwtOrgId: string | null): Promise<AccountMeDto> {
    const { user, membership } = await this.loadUserContext(userId, jwtOrgId);
    const orgId = membership.organizationId;

    const [accountPref, notificationRows, stationCount, sessions] = await Promise.all([
      this.ensureAccountPreference(userId, orgId),
      this.ensureNotificationPreferences(userId, orgId),
      this.prisma.station.count({
        where: { organizationId: orgId, status: { not: 'ARCHIVED' } },
      }),
      this.refreshTokens.listSessionsForUser(userId),
    ]);

    const currentSessionId = this.refreshTokens.resolveCurrentSessionId(sessions);
    const notifications = this.mapNotifications(notificationRows);
    const [twoFactorEnabled, twoFactorAvailable] = await Promise.all([
      this.twoFactor.isEnabled(userId),
      Promise.resolve(this.twoFactor.isAvailable()),
    ]);

    return this.buildViewModel(
      user,
      membership,
      accountPref,
      notifications,
      stationCount,
      sessions,
      currentSessionId,
      twoFactorEnabled,
      twoFactorAvailable,
    );
  }

  async updateProfile(
    userId: string,
    jwtOrgId: string | null,
    dto: UpdateMyProfileDto,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<AccountMeDto> {
    const { user, membership } = await this.loadUserContext(userId, jwtOrgId);

    const nextFirst = dto.firstName !== undefined ? dto.firstName : user.firstName;
    const nextLast = dto.lastName !== undefined ? dto.lastName : user.lastName;
    if (dto.firstName !== undefined && !dto.firstName?.trim()) {
      throw new BadRequestException('firstName cannot be empty');
    }
    if (dto.lastName !== undefined && !dto.lastName?.trim()) {
      throw new BadRequestException('lastName cannot be empty');
    }

    const displayName = [nextFirst, nextLast].filter(Boolean).join(' ').trim() || user.email;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.mobile !== undefined ? { mobile: dto.mobile } : {}),
        name: displayName,
      },
    });

    void this.audit.record({
      actorUserId: userId,
      actorOrganizationId: membership.organizationId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.USER,
      entityId: userId,
      description: 'Account profile updated (self-service)',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
    });

    return this.getMe(userId, jwtOrgId);
  }

  async updatePreferences(
    userId: string,
    jwtOrgId: string | null,
    dto: UpdateMyPreferencesDto,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<AccountMeDto> {
    const { membership } = await this.loadUserContext(userId, jwtOrgId);
    const orgId = membership.organizationId;

    if (dto.timezone !== undefined && !IANA_TZ_RE.test(dto.timezone)) {
      throw new BadRequestException('timezone must be a valid IANA timezone (e.g. Europe/Berlin)');
    }

    if (dto.defaultStationId) {
      const station = await this.prisma.station.findFirst({
        where: { id: dto.defaultStationId, organizationId: orgId },
      });
      if (!station) {
        throw new BadRequestException('defaultStationId does not belong to your organization');
      }
    }

    if (
      dto.language !== undefined ||
      dto.timezone !== undefined ||
      dto.dateFormat !== undefined
    ) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.language !== undefined ? { language: dto.language } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.dateFormat !== undefined ? { dateFormat: dto.dateFormat } : {}),
        },
      });
    }

    if (dto.defaultStationId !== undefined || dto.defaultLandingPage !== undefined) {
      await this.prisma.userAccountPreference.upsert({
        where: { userId_organizationId: { userId, organizationId: orgId } },
        create: {
          userId,
          organizationId: orgId,
          defaultStationId: dto.defaultStationId ?? null,
          defaultLandingPage: dto.defaultLandingPage ?? null,
        },
        update: {
          ...(dto.defaultStationId !== undefined
            ? { defaultStationId: dto.defaultStationId || null }
            : {}),
          ...(dto.defaultLandingPage !== undefined
            ? { defaultLandingPage: dto.defaultLandingPage || null }
            : {}),
        },
      });
    }

    void this.audit.record({
      actorUserId: userId,
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.USER,
      entityId: userId,
      description: 'Account preferences updated (self-service)',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
    });

    return this.getMe(userId, jwtOrgId);
  }

  async updateNotifications(
    userId: string,
    jwtOrgId: string | null,
    items: NotificationPreferenceItemDto[],
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<AccountMeDto> {
    const { membership } = await this.loadUserContext(userId, jwtOrgId);
    const orgId = membership.organizationId;

    for (const item of items) {
      const merged = this.mergeNotificationItem(item);
      this.assertSecurityChannelAllowed(item.category, merged.inApp, merged.email);

      await this.prisma.userNotificationPreference.upsert({
        where: {
          userId_organizationId_category: {
            userId,
            organizationId: orgId,
            category: item.category,
          },
        },
        create: {
          userId,
          organizationId: orgId,
          category: item.category,
          ...merged,
        },
        update: merged,
      });
    }

    void this.audit.record({
      actorUserId: userId,
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.USER,
      entityId: userId,
      description: 'Notification preferences updated (self-service)',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
    });

    return this.getMe(userId, jwtOrgId);
  }

  async changePassword(
    userId: string,
    jwtOrgId: string | null,
    dto: ChangeMyPasswordDto,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ): Promise<{ message: string }> {
    await this.loadUserContext(userId, jwtOrgId);

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('newPassword and confirmPassword must match');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('newPassword must differ from currentPassword');
    }
    this.assertPasswordPolicy(dto.newPassword);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new BadRequestException('Password is not set for this account');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: false },
    });

    if (dto.revokeOtherSessions) {
      await this.refreshTokens.revokeOtherSessionsForUser(userId);
    }

    void this.audit.record({
      actorUserId: userId,
      actorOrganizationId: jwtOrgId ?? undefined,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: userId,
      description: 'Password changed (self-service)',
      level: 'WARN',
      route: auditCtx.route,
      ipAddress: auditCtx.ip,
      userAgent: auditCtx.userAgent,
    });

    return { message: 'Password updated successfully' };
  }

  async listSessions(userId: string, jwtOrgId: string | null): Promise<AccountSessionDto[]> {
    await this.loadUserContext(userId, jwtOrgId);
    const tokens = await this.refreshTokens.listSessionsForUser(userId);
    const currentId = this.refreshTokens.resolveCurrentSessionId(tokens);

    return tokens.map((t) => {
      const parsed = this.parseUserAgent(t.userAgent);
      return {
        id: t.id,
        current: t.id === currentId,
        userAgent: t.userAgent,
        browser: parsed.browser,
        device: parsed.device,
        os: parsed.os,
        ipAddress: t.ipAddress,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
        revokedAt: t.revokedAt?.toISOString() ?? null,
        lastUsedAt: t.createdAt.toISOString(),
        status: this.sessionStatus(t),
      };
    });
  }

  async revokeOtherSessions(
    userId: string,
    jwtOrgId: string | null,
    keepSessionId?: string,
    auditCtx?: { ip?: string; userAgent?: string; route?: string },
  ) {
    await this.loadUserContext(userId, jwtOrgId);
    const result = await this.refreshTokens.revokeOtherSessionsForUser(userId, keepSessionId);

    void this.audit.record({
      actorUserId: userId,
      actorOrganizationId: jwtOrgId ?? undefined,
      action: ActivityAction.REVOKE,
      entity: ActivityEntity.REFRESH_TOKEN,
      entityId: userId,
      description: `Revoked ${result.revoked} other session(s) (self-service)`,
      route: auditCtx?.route,
      ipAddress: auditCtx?.ip,
      userAgent: auditCtx?.userAgent,
    });

    return result;
  }

  async revokeSession(
    userId: string,
    jwtOrgId: string | null,
    sessionId: string,
    auditCtx?: { ip?: string; userAgent?: string; route?: string },
  ) {
    await this.loadUserContext(userId, jwtOrgId);

    const tokens = await this.refreshTokens.listSessionsForUser(userId);
    const currentId = this.refreshTokens.resolveCurrentSessionId(tokens);
    if (sessionId === currentId) {
      throw new BadRequestException(
        'Cannot revoke the current session from this endpoint — use logout instead',
      );
    }

    const ok = await this.refreshTokens.revokeSessionById(userId, sessionId);
    if (!ok) {
      throw new NotFoundException('Session not found or already revoked');
    }

    void this.audit.record({
      actorUserId: userId,
      actorOrganizationId: jwtOrgId ?? undefined,
      action: ActivityAction.REVOKE,
      entity: ActivityEntity.REFRESH_TOKEN,
      entityId: sessionId,
      description: 'Session revoked (self-service)',
      route: auditCtx?.route,
      ipAddress: auditCtx?.ip,
      userAgent: auditCtx?.userAgent,
    });

    return { revoked: true };
  }

  async setupTotp(
    userId: string,
    jwtOrgId: string | null,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ) {
    const { user } = await this.loadUserContext(userId, jwtOrgId);
    return this.twoFactor.setupTotp(userId, user.email, auditCtx);
  }

  async verifyTotp(
    userId: string,
    jwtOrgId: string | null,
    code: string,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ) {
    await this.loadUserContext(userId, jwtOrgId);
    return this.twoFactor.verifyAndEnableTotp(userId, code, auditCtx);
  }

  async disableTotp(
    userId: string,
    jwtOrgId: string | null,
    dto: { currentPassword?: string; totpCode?: string },
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ) {
    await this.loadUserContext(userId, jwtOrgId);
    return this.twoFactor.disableTotp(userId, dto, auditCtx);
  }

  async regenerateRecoveryCodes(
    userId: string,
    jwtOrgId: string | null,
    totpCode: string,
    auditCtx: { ip?: string; userAgent?: string; route?: string },
  ) {
    await this.loadUserContext(userId, jwtOrgId);
    return this.twoFactor.regenerateRecoveryCodes(userId, totpCode, auditCtx);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async loadUserContext(
    userId: string,
    jwtOrgId: string | null,
  ): Promise<{ user: User; membership: MembershipWithOrg }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const membership = await this.resolveMembership(userId, jwtOrgId);
    return { user, membership };
  }

  private async resolveMembership(
    userId: string,
    jwtOrgId: string | null,
  ): Promise<MembershipWithOrg> {
    if (jwtOrgId) {
      const m = await this.prisma.organizationMembership.findFirst({
        where: { userId, organizationId: jwtOrgId, status: 'ACTIVE' },
        include: { organization: true },
      });
      if (!m) {
        throw new ForbiddenException('No active membership in current organization');
      }
      return m;
    }

    const m = await this.prisma.organizationMembership.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!m) {
      throw new ForbiddenException('No active organization membership');
    }
    return m;
  }

  private async ensureAccountPreference(userId: string, organizationId: string) {
    return this.prisma.userAccountPreference.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: { userId, organizationId },
      update: {},
    });
  }

  private async ensureNotificationPreferences(userId: string, organizationId: string) {
    const existing = await this.prisma.userNotificationPreference.findMany({
      where: { userId, organizationId },
    });
    const byCategory = new Map(existing.map((r) => [r.category, r]));
    const missing = NOTIFICATION_CATEGORY_ORDER.filter((c) => !byCategory.has(c));

    if (missing.length > 0) {
      await this.prisma.userNotificationPreference.createMany({
        data: missing.map((category) => {
          const meta = NOTIFICATION_CATEGORY_META[category];
          return {
            userId,
            organizationId,
            category,
            inApp: meta.inApp,
            email: meta.email,
            push: meta.push,
            sms: meta.sms,
            criticalOnly: meta.criticalOnly,
          };
        }),
        skipDuplicates: true,
      });
      return this.prisma.userNotificationPreference.findMany({
        where: { userId, organizationId },
      });
    }

    return existing;
  }

  private mapNotifications(rows: UserNotificationPreference[]) {
    const byCategory = new Map(rows.map((r) => [r.category, r]));
    return NOTIFICATION_CATEGORY_ORDER.map((category) => {
      const meta = NOTIFICATION_CATEGORY_META[category];
      const row = byCategory.get(category);
      return {
        category,
        label: meta.label,
        description: meta.description,
        inApp: row?.inApp ?? meta.inApp,
        email: row?.email ?? meta.email,
        push: row?.push ?? meta.push,
        sms: row?.sms ?? meta.sms,
        criticalOnly: row?.criticalOnly ?? meta.criticalOnly,
      };
    });
  }

  private mergeNotificationItem(item: NotificationPreferenceItemDto) {
    const defaults = NOTIFICATION_CATEGORY_META[item.category];
    return {
      inApp: item.inApp ?? defaults.inApp,
      email: item.email ?? defaults.email,
      push: item.push ?? defaults.push,
      sms: item.sms ?? defaults.sms,
      criticalOnly: item.criticalOnly ?? defaults.criticalOnly,
    };
  }

  private assertSecurityChannelAllowed(
    category: NotificationCategory,
    inApp: boolean,
    email: boolean,
  ) {
    if (category === NotificationCategory.SECURITY && !inApp && !email) {
      throw new BadRequestException(
        'SECURITY notifications must keep at least inApp or email enabled',
      );
    }
  }

  private assertPasswordPolicy(password: string) {
    const minLength = 10;
    if (!password || password.length < minLength) {
      throw new BadRequestException(`Password must be at least ${minLength} characters`);
    }
  }

  private sessionStatus(token: {
    revokedAt: Date | null;
    expiresAt: Date;
  }): AccountSessionStatus {
    if (token.revokedAt) return 'revoked';
    if (token.expiresAt < new Date()) return 'expired';
    return 'active';
  }

  private parseUserAgent(ua: string | null): {
    browser: string;
    device: string;
    os: string | null;
  } {
    if (!ua) return { browser: 'Unbekannt', device: 'Desktop', os: null };

    let browser = 'Browser';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

    let device = 'Desktop';
    if (/iPad|Tablet/i.test(ua)) device = 'Tablet';
    else if (/Mobile|Android|iPhone/i.test(ua)) device = 'Mobile';

    let os: string | null = null;
    if (/Windows NT/i.test(ua)) os = 'Windows';
    else if (/iPad/i.test(ua)) os = 'iPadOS';
    else if (/iPhone|iOS/i.test(ua)) os = 'iOS';
    else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Linux/i.test(ua)) os = 'Linux';

    return { browser, device, os };
  }

  private buildViewModel(
    user: User,
    membership: MembershipWithOrg,
    accountPref: { defaultStationId: string | null; defaultLandingPage: string | null },
    notifications: ReturnType<AccountService['mapNotifications']>,
    stationCount: number,
    sessions: Array<{
      id: string;
      revokedAt: Date | null;
      expiresAt: Date;
      replacedBy: string | null;
      createdAt: Date;
    }>,
    currentSessionId: string | null,
    twoFactorEnabled: boolean,
    twoFactorAvailable: boolean,
  ): AccountMeDto {
    const now = new Date();
    const activeSessions = sessions.filter(
      (s) => !s.revokedAt && s.expiresAt > now && !s.replacedBy,
    );
    const staleSessions = activeSessions.filter(
      (s) => now.getTime() - s.createdAt.getTime() > 30 * 24 * 60 * 60 * 1000,
    );

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.name ||
      user.email;

    const permissions =
      (membership.permissions as Record<string, { read: boolean; write: boolean }> | null) ??
      null;

    const health = this.computeAccountHealth(user, accountPref, notifications, stationCount);
    const security = this.computeSecurityScore(
      user,
      activeSessions.length,
      staleSessions.length,
      twoFactorEnabled,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName,
        phone: user.phone,
        mobile: user.mobile,
        avatarUrl: user.avatarUrl,
        language: user.language,
        timezone: user.timezone,
        dateFormat: user.dateFormat,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        lastLoginIp: user.lastLoginIp,
        lastLoginDevice: user.lastLoginDevice,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.companyName,
        slug: membership.organization.shortCode,
        status: membership.organization.status,
      },
      membership: {
        id: membership.id,
        role: membership.role,
        roleLabel: membership.roleLabel ?? ROLE_DISPLAY[membership.role] ?? membership.role,
        department: membership.department,
        position: membership.position,
        stationScope: membership.stationScope,
        permissions,
        status: membership.status,
      },
      preferences: {
        language: user.language,
        timezone: user.timezone,
        dateFormat: user.dateFormat,
        defaultStationId: accountPref.defaultStationId,
        defaultLandingPage: accountPref.defaultLandingPage,
      },
      notifications,
      security: {
        hasPassword: Boolean(user.passwordHash),
        twoFactorEnabled,
        twoFactorAvailable,
        passkeysAvailable: false,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        lastLoginIp: user.lastLoginIp,
        activeSessionCount: activeSessions.length,
        securityScore: security.score,
        recommendations: security.recommendations,
      },
      accountHealth: health,
    };
  }

  private computeAccountHealth(
    user: User,
    accountPref: { defaultStationId: string | null },
    notifications: { category: NotificationCategory }[],
    stationCount: number,
  ) {
    const checks: Array<{ key: string; ok: boolean; recommendation?: string }> = [
      {
        key: 'name',
        ok: Boolean(user.firstName?.trim() && user.lastName?.trim()),
        recommendation: 'Vor- und Nachname ergänzen',
      },
      {
        key: 'phone',
        ok: Boolean(user.phone?.trim() || user.mobile?.trim()),
        recommendation: 'Telefon- oder Mobilnummer hinterlegen',
      },
      {
        key: 'language',
        ok: Boolean(user.language),
        recommendation: 'Sprache auswählen',
      },
      {
        key: 'timezone',
        ok: Boolean(user.timezone),
        recommendation: 'Zeitzone festlegen',
      },
      {
        key: 'notifications',
        ok: notifications.length >= NOTIFICATION_CATEGORY_ORDER.length,
        recommendation: 'Benachrichtigungseinstellungen prüfen',
      },
      {
        key: 'lastLogin',
        ok: Boolean(user.lastLoginAt),
        recommendation: 'Noch keine Anmeldung erfasst',
      },
    ];

    if (stationCount > 0) {
      checks.push({
        key: 'defaultStation',
        ok: Boolean(accountPref.defaultStationId),
        recommendation: 'Standard-Station auswählen',
      });
    }

    const completedItems = checks.filter((c) => c.ok).map((c) => c.key);
    const missingItems = checks.filter((c) => !c.ok).map((c) => c.key);
    const recommendations = checks
      .filter((c) => !c.ok && c.recommendation)
      .map((c) => c.recommendation!);

    const score = Math.round((completedItems.length / checks.length) * 100);

    return { score, completedItems, missingItems, recommendations };
  }

  private computeSecurityScore(
    user: User,
    activeSessionCount: number,
    longLivedSessionCount: number,
    twoFactorEnabled: boolean,
  ) {
    const recommendations: string[] = [];
    let points = 0;
    const max = 5;

    if (user.passwordHash) points += 1;
    else recommendations.push('Passwort setzen');

    if (twoFactorEnabled) points += 1;
    else recommendations.push('Zwei-Faktor-Authentifizierung aktivieren');

    if (user.lastLoginAt) points += 1;
    else recommendations.push('Erste Anmeldung durchführen');

    if (activeSessionCount <= 3) points += 1;
    else recommendations.push('Aktive Sitzungen prüfen — mehrere Geräte angemeldet');

    if (longLivedSessionCount === 0) points += 1;
    else recommendations.push('Alte Sitzungen widerrufen');

    return {
      score: Math.round((points / max) * 100),
      recommendations,
    };
  }
}
