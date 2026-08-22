import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { buildSyntheticSmsConfigPublicDto } from './sms-config.public';
import { SmsConfigService } from './sms-config.service';
import { SmsController } from './sms.controller';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

type MembershipRow = {
  role: string;
  status: string;
  permissions: unknown;
};

const MEMBERSHIPS: Record<string, MembershipRow> = {
  'reader|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { communication: { read: true, write: false, manage: false } },
  },
  'denied|org-a': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { dashboard: { read: true, write: false, manage: false } },
  },
  'reader|org-b': {
    role: 'WORKER',
    status: 'ACTIVE',
    permissions: { communication: { read: true, write: false, manage: false } },
  },
};

function makePrisma() {
  const orgSmsConfig = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  };

  return {
    orgSmsConfig,
    organizationMembership: {
      findFirst: jest.fn(async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
        const key = `${args.where.userId}|${args.where.organizationId}`;
        const row = MEMBERSHIPS[key];
        if (!row) return null;
        if (args.where.status && row.status !== args.where.status) return null;
        return row;
      }),
    },
    organization: {
      findUnique: jest.fn(async () => ({ id: 'org-a' })),
    },
  };
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

describe('SmsController — HTTP security integration', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      controllers: [SmsController],
      providers: [
        SmsConfigService,
        OrgScopingGuard,
        PermissionsGuard,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
      const header = req.headers['x-test-user'];
      if (header && header !== 'null') req.user = JSON.parse(header);
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const readerA = { id: 'reader', platformRole: 'USER', organizationId: 'org-a' };
  const deniedA = { id: 'denied', platformRole: 'USER', organizationId: 'org-a' };
  const readerB = { id: 'reader', platformRole: 'USER', organizationId: 'org-b' };

  it('returns synthetic NOT_CONFIGURED DTO with zero DB writes when no row exists', async () => {
    prisma.orgSmsConfig.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get('/organizations/org-a/sms/config')
      .set(...auth(readerA))
      .expect(200);

    expect(res.body).toEqual(buildSyntheticSmsConfigPublicDto('org-a'));
    expect(prisma.orgSmsConfig.create).not.toHaveBeenCalled();
    expect(prisma.orgSmsConfig.update).not.toHaveBeenCalled();
    expect(prisma.orgSmsConfig.upsert).not.toHaveBeenCalled();
  });

  it('returns safe DTO for existing config row', async () => {
    prisma.orgSmsConfig.findUnique.mockResolvedValue({
      organizationId: 'org-a',
      isConnected: true,
      isActive: true,
      apiKeyConfigured: true,
      webhookSigningSecretConfigured: true,
      senderProfileId: 'sender-1',
      webhookEndpointId: 'endpoint-1',
      lastWebhookAt: new Date('2026-08-22T10:00:00.000Z'),
      updatedAt: new Date('2026-08-22T11:00:00.000Z'),
    });

    const res = await request(app.getHttpServer())
      .get('/organizations/org-a/sms/config')
      .set(...auth(readerA))
      .expect(200);

    expect(res.body).toMatchObject({
      organizationId: 'org-a',
      hasConfigRow: true,
      credentialsConfigured: true,
      webhookSigningConfigured: true,
      senderProfileConfigured: true,
      webhookEndpointConfigured: true,
    });
    expect(res.body).not.toHaveProperty('apiKey');
    expect(res.body).not.toHaveProperty('webhookSigningSecret');
  });

  it('denies cross-org route via OrgScopingGuard', async () => {
    await request(app.getHttpServer())
      .get('/organizations/org-a/sms/config')
      .set(...auth(readerB))
      .expect(403);
  });

  it('denies authenticated user without communication.read', async () => {
    await request(app.getHttpServer())
      .get('/organizations/org-a/sms/config')
      .set(...auth(deniedA))
      .expect(403);
  });
});
