import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  ForbiddenException,
  Get,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { PasswordResetService } from './password-reset.service';
import {
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/password-reset.dto';
import { LoginDto, RefreshTokenDto, LogoutDto } from '@shared/dto/auth.dto';
import { SwitchOrganizationDto } from './dto/switch-organization.dto';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { resolveLoginMembership } from '@modules/users/policies/refresh-session-binding.policy';
import { mapMembershipsToOrganizationOptions } from '@modules/users/policies/organization-switch.policy';
import { AuthSessionContextService } from './auth-session-context.service';
import { OrganizationSwitchService } from './organization-switch.service';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

@Controller('auth')
export class AuthController {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly passwordResetService: PasswordResetService,
    private readonly audit: AuditService,
    private readonly sessionContext: AuthSessionContextService,
    private readonly organizationSwitch: OrganizationSwitchService,
    private readonly iamMetrics: IamMetricsService,
  ) {
    // JWT_SECRET is validated at startup by app.config.ts; reading it here is safe
    this.jwtSecret = this.configService.get<string>('app.jwtSecret')!;
    this.jwtExpiresIn = this.configService.get<string>('app.jwtExpiresIn', '24h');
  }

  // Strict rate limit on login: max 10 attempts per minute per IP
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto, @Req() req: any) {
    const { email, password, organizationId } = body;
    if (!email || !password) {
      this.iamMetrics.recordLoginFailure('missing_credentials');
      throw new UnauthorizedException('Email and password are required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const auditBase = {
      actorUserId: undefined as string | undefined,
      actorOrganizationId: undefined as string | undefined,
      ipAddress: req?.ip ?? req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      route: 'POST /auth/login',
    };

    if (!user) {
      this.iamMetrics.recordLoginFailure('unknown_email');
      void this.audit.warn({
        ...auditBase,
        action: ActivityAction.AUTH_FAIL,
        entity: ActivityEntity.AUTH_EVENT,
        description: `Login failed — unknown email: ${email}`,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      this.iamMetrics.recordLoginFailure('inactive_account');
      void this.audit.warn({
        ...auditBase,
        actorUserId: user.id,
        action: ActivityAction.AUTH_FAIL,
        entity: ActivityEntity.AUTH_EVENT,
        entityId: user.id,
        description: `Login rejected — account inactive: ${email}`,
      });
      throw new UnauthorizedException('Account is inactive');
    }

    if (!user.passwordHash) {
      this.iamMetrics.recordLoginFailure('invalid_password');
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      this.iamMetrics.recordLoginFailure('invalid_password');
      void this.audit.warn({
        ...auditBase,
        actorUserId: user.id,
        action: ActivityAction.AUTH_FAIL,
        entity: ActivityEntity.AUTH_EVENT,
        entityId: user.id,
        description: `Login failed — wrong password: ${email}`,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: (req as any)?.ip ?? null,
        lastLoginDevice: ((req as any)?.headers?.['user-agent'] as string | undefined)?.slice(0, 500) ?? null,
      },
    });

    const membershipCandidates = user.memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      organizationId: m.organizationId,
      role: m.role,
      status: m.status,
      membershipVersion: m.membershipVersion,
      permissions: m.permissions,
      organizationRoleId: m.organizationRoleId,
      organization: m.organization,
    }));

    const membershipResolution = resolveLoginMembership(membershipCandidates, {
      requestedOrganizationId: organizationId,
    });

    if (!membershipResolution.ok) {
      if (membershipResolution.code === 'ORGANIZATION_SELECTION_REQUIRED') {
        void this.audit.record({
          ...auditBase,
          actorUserId: user.id,
          action: ActivityAction.LOGIN,
          entity: ActivityEntity.AUTH_EVENT,
          entityId: user.id,
          description: `Login credentials verified — organization selection required: ${email}`,
        });
        return this.sessionContext.buildOrganizationSelectionPayload(
          membershipCandidates,
          user.lastSelectedOrganizationId,
        );
      }

      void this.audit.warn({
        ...auditBase,
        actorUserId: user.id,
        action: ActivityAction.AUTH_FAIL,
        entity: ActivityEntity.AUTH_EVENT,
        entityId: user.id,
        description: `Login rejected — ${membershipResolution.code}: ${email}`,
      });
      throw new UnauthorizedException(membershipResolution.message);
    }

    const membership = membershipResolution.membership;

    if (membership?.organizationId && organizationId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastSelectedOrganizationId: membership.organizationId },
      });
    }

    const { accessToken, refreshToken, expiresIn } = await this.refreshTokenService.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        sessionVersion: user.sessionVersion,
      },
      membership
        ? {
            role: membership.role,
            organizationId: membership.organizationId,
            organizationName: membership.organization?.companyName ?? null,
            organizationLogoUrl: membership.organization?.logoUrl ?? null,
            permissions: membership.permissions,
            membershipId: membership.id,
            membershipVersion: membership.membershipVersion,
            organizationRoleId: membership.organizationRoleId,
          }
        : null,
      {
        userAgent: (req as any)?.headers?.['user-agent'],
        ipAddress: (req as any)?.ip,
      },
    );

    this.iamMetrics.recordLoginSuccess();
    void this.audit.record({
      ...auditBase,
      actorUserId: user.id,
      actorOrganizationId: membership?.organizationId ?? undefined,
      action: ActivityAction.LOGIN,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: user.id,
      description: `Login success: ${email}`,
    });

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      expiresIn,
      mustChangePassword: user.mustChangePassword,
      user: this.sessionContext.buildUserResponse(user, membership),
      organizations: mapMembershipsToOrganizationOptions(membershipCandidates),
    };
  }

  /** List active organization memberships for the authenticated user. */
  @Get('memberships')
  async memberships(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastSelectedOrganizationId: true },
    });
    const organizations = await this.organizationSwitch.listActiveOrganizations(userId);
    return {
      organizations,
      activeOrganizationId: req.user?.organizationId ?? null,
      suggestedOrganizationId: user?.lastSelectedOrganizationId ?? null,
    };
  }

  /** Explicit organization session switch — mints a new org-bound token family. */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('switch-organization')
  @HttpCode(HttpStatus.OK)
  async switchOrganization(@Body() body: SwitchOrganizationDto, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const result = await this.organizationSwitch.switchOrganization({
      userId,
      currentOrganizationId: req.user?.organizationId ?? null,
      targetOrganizationId: body.organizationId,
      refreshToken: body.refreshToken,
      context: {
        userAgent: req?.headers?.['user-agent'],
        ipAddress: req?.ip,
        route: 'POST /auth/switch-organization',
      },
    });

    return {
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: {
        id: userId,
        email: req.user?.email,
        name: req.user?.name,
        platformRole: req.user?.platformRole,
        ...result.user,
      },
      organizations: result.organizations,
    };
  }

  /** Public self-service password reset request (enumeration-safe). */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() body: RequestPasswordResetDto, @Req() req: any) {
    return this.passwordResetService.requestSelfServiceReset({
      email: body.email,
      context: {
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      },
    });
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() body: ConfirmPasswordResetDto, @Req() req: any) {
    return this.passwordResetService.confirmReset({
      token: body.token,
      newPassword: body.newPassword,
      confirmPassword: body.confirmPassword,
      context: {
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      },
    });
  }

  /** Exchange a valid refresh token for a new access + refresh token pair (rotation). */
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: RefreshTokenDto,
    @Req() req: any,
  ) {
    if (!body.refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }
    const result = await this.refreshTokenService.rotate(body.refreshToken, {
      userAgent: req?.headers?.['user-agent'],
      ipAddress: req?.ip,
    });
    const decoded = this.decodeAccessToken(result.accessToken);
    const membership = decoded
      ? await this.sessionContext.resolveSessionMembership(
          decoded.id,
          decoded.organizationId,
          decoded.membershipId,
        )
      : null;
    const fullUser = decoded
      ? await this.prisma.user.findUnique({ where: { id: decoded.id } })
      : null;

    void this.audit.record({
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      route: 'POST /auth/refresh',
      actorUserId: decoded?.id,
      actorOrganizationId: decoded?.organizationId ?? undefined,
      action: ActivityAction.REFRESH,
      entity: ActivityEntity.REFRESH_TOKEN,
      description: 'Access token refreshed via rotation',
    });
    return {
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user:
        fullUser && decoded
          ? this.sessionContext.buildUserResponse(fullUser, membership)
          : undefined,
    };
  }

  /** Revoke a specific refresh token (logout from current device). */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: LogoutDto, @Req() req: any) {
    if (body.refreshToken) {
      await this.refreshTokenService.revoke(body.refreshToken);
    }
    void this.audit.record({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.LOGOUT,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: req.user?.id,
      description: `Logout: user ${req.user?.id ?? 'unknown'} (single device)`,
    });
    return { message: 'Logged out successfully' };
  }

  /** Revoke all refresh tokens for the authenticated user (logout from all devices). */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Req() req: any) {
    const userId = req.user?.id;
    if (userId) {
      await this.refreshTokenService.revokeAllForUser(userId);
    }
    void this.audit.warn({
      ...AuditService.contextFromRequest(req),
      action: ActivityAction.REVOKE_ALL,
      entity: ActivityEntity.REFRESH_TOKEN,
      entityId: userId,
      description: `Logout all devices: user ${userId ?? 'unknown'}`,
    });
    return { message: 'Logged out from all devices' };
  }

  @Get('me')
  async me(@Req() req: any) {
    const user = req.user;
    if (!user || !user.id) {
      throw new UnauthorizedException('Not authenticated');
    }

    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    const membership = await this.sessionContext.resolveSessionMembership(
      user.id,
      user.organizationId,
      user.membershipId,
    );

    return this.sessionContext.buildUserResponse(fullUser, membership);
  }

  /**
   * Bootstrap endpoint to create the initial MASTER_ADMIN.
   *
   * Security gates (all must pass):
   *   1. ENABLE_SEED_ADMIN=true must be set in environment
   *   2. SEED_ADMIN_TOKEN must be set and must match the x-seed-token header
   *
   * Disabled by default. Must never be usable in production without explicit opt-in.
   * Does NOT accept or return passwords — caller must set the password via a separate flow.
   */
  // Very strict rate limit on seed-admin: max 3 attempts per 5 minutes
  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @Post('seed-admin')
  @HttpCode(HttpStatus.OK)
  async seedAdmin(@Headers('x-seed-token') tokenHeader: string | undefined) {
    const enableSeedAdmin = this.configService.get<boolean>('app.enableSeedAdmin', false);
    const seedAdminToken = this.configService.get<string>('app.seedAdminToken', '');

    if (!enableSeedAdmin || !seedAdminToken) {
      throw new ForbiddenException('Seed-admin endpoint is disabled');
    }

    if (!tokenHeader || tokenHeader !== seedAdminToken) {
      throw new ForbiddenException('Invalid seed-admin token');
    }

    const existing = await this.prisma.user.findFirst({
      where: { platformRole: 'MASTER_ADMIN' },
    });

    if (existing) {
      return { message: 'Admin already exists', email: existing.email };
    }

    // Create admin without a password — caller must use change-password flow to set one
    const admin = await this.prisma.user.create({
      data: {
        email: process.env.SEED_ADMIN_EMAIL || 'admin@synqdrive.de',
        name: 'Master Admin',
        passwordHash: null,
        platformRole: 'MASTER_ADMIN',
        status: 'ACTIVE',
      },
    });

    return { message: 'Admin created — set a password before use', email: admin.email };
  }

  private decodeAccessToken(accessToken: string): {
    id: string;
    organizationId: string | null;
    membershipId: string | null;
  } | null {
    try {
      const decoded = jwt.verify(accessToken, this.jwtSecret) as {
        sub: string;
        organizationId?: string | null;
        membershipId?: string | null;
      };
      return {
        id: decoded.sub,
        organizationId: decoded.organizationId ?? null,
        membershipId: decoded.membershipId ?? null,
      };
    } catch {
      return null;
    }
  }
}
