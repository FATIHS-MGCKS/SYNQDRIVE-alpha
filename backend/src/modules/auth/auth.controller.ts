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
import { LoginDto, RefreshTokenDto, LogoutDto } from '@shared/dto/auth.dto';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Controller('auth')
export class AuthController {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly audit: AuditService,
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
    const { email, password } = body;
    if (!email || !password) {
      throw new UnauthorizedException('Email and password are required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
          take: 1,
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
      void this.audit.warn({
        ...auditBase,
        action: ActivityAction.AUTH_FAIL,
        entity: ActivityEntity.AUTH_EVENT,
        description: `Login failed — unknown email: ${email}`,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
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
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
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

    const membership = user.memberships[0];
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      membershipRole: membership?.role ?? null,
      organizationId: membership?.organizationId ?? null,
      organizationName: membership?.organization?.companyName ?? null,
      organizationLogoUrl: membership?.organization?.logoUrl ?? null,
    };

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
          }
        : null,
      {
        userAgent: (req as any)?.headers?.['user-agent'],
        ipAddress: (req as any)?.ip,
      },
    );

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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        membershipRole: membership?.role ?? null,
        organizationId: membership?.organizationId ?? null,
        organizationName: membership?.organization?.companyName ?? null,
        organizationLogoUrl: membership?.organization?.logoUrl ?? null,
        permissions: (membership?.permissions as Record<string, { read: boolean; write: boolean }>) ?? null,
      },
    };
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
    void this.audit.record({
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      route: 'POST /auth/refresh',
      action: ActivityAction.REFRESH,
      entity: ActivityEntity.REFRESH_TOKEN,
      description: 'Access token refreshed via rotation',
    });
    return {
      token: result.accessToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
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
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: true },
          take: 1,
        },
      },
    });

    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    const membership = fullUser.memberships[0];
    return {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      platformRole: fullUser.platformRole,
      membershipRole: membership?.role ?? null,
      organizationId: membership?.organizationId ?? null,
      organizationName: membership?.organization?.companyName ?? null,
      organizationLogoUrl: membership?.organization?.logoUrl ?? null,
      permissions: (membership?.permissions as Record<string, { read: boolean; write: boolean }>) ?? null,
    };
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
}
