import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
  Req,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'synqdrive-dev-jwt-secret-2026';
const JWT_EXPIRES_IN = '24h';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
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

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return {
      token,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        membershipRole: membership?.role ?? null,
        organizationId: membership?.organizationId ?? null,
        organizationName: membership?.organization?.companyName ?? null,
        permissions: (membership?.permissions as Record<string, { read: boolean; write: boolean }>) ?? null,
      },
    };
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
      permissions: (membership?.permissions as Record<string, { read: boolean; write: boolean }>) ?? null,
    };
  }

  @Post('seed-admin')
  async seedAdmin() {
    const existing = await this.prisma.user.findFirst({
      where: { platformRole: 'MASTER_ADMIN' },
    });

    if (existing) {
      if (!existing.passwordHash) {
        const hash = await bcrypt.hash('SynqDrive2026!', 10);
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash: hash },
        });
        return { message: 'Password set for existing admin', email: existing.email };
      }
      return { message: 'Admin already exists', email: existing.email };
    }

    const hash = await bcrypt.hash('SynqDrive2026!', 10);
    const admin = await this.prisma.user.create({
      data: {
        email: 'admin@synqdrive.de',
        name: 'Master Admin',
        passwordHash: hash,
        platformRole: 'MASTER_ADMIN',
        status: 'ACTIVE',
      },
    });

    return { message: 'Admin created', email: admin.email, password: 'SynqDrive2026!' };
  }
}
