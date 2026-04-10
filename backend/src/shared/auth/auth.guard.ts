import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'synqdrive-dev-jwt-secret-2026';

const PUBLIC_PATH_PREFIXES = [
  '/api/v1/auth/',
  '/api/v1/vehicles/register/ai-specs',
  '/api/v1/vehicles/register/ai-tire-specs',
  '/api/v1/webhooks/',
];

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path: string = request.url || request.path || '';

    if (!path.startsWith('/api/')) {
      return true;
    }

    if (PUBLIC_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      return true;
    }

    const token = this.extractToken(request);

    if (token) {
      return this.validateJwt(request, token);
    }

    if (process.env.NODE_ENV === 'development') {
      return this.injectDevUser(request);
    }

    throw new UnauthorizedException('Missing authentication token');
  }

  private async validateJwt(request: any, token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      request.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        platformRole: decoded.platformRole,
        membershipRole: decoded.membershipRole,
        organizationId: decoded.organizationId,
      };
      return true;
    } catch {
      if (process.env.NODE_ENV === 'development') {
        return this.injectDevUser(request);
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async injectDevUser(request: any): Promise<boolean> {
    const adminUser = await this.prisma.user.findFirst({
      where: { platformRole: 'MASTER_ADMIN', status: 'ACTIVE' },
      include: { memberships: { where: { status: 'ACTIVE' }, include: { organization: true } } },
    });

    if (!adminUser) {
      this.logger.warn('Dev bypass: no MASTER_ADMIN user found — allowing unauthenticated access');
      request.user = { id: 'dev-user', platformRole: 'MASTER_ADMIN' };
      return true;
    }

    request.user = {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      platformRole: adminUser.platformRole,
      membershipRole: 'ORG_ADMIN',
      memberships: adminUser.memberships,
    };
    return true;
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
