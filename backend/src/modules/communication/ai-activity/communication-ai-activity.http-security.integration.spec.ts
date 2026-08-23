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
import { StationAccessService } from '@shared/stations/station-access.service';
import { CommunicationAiActivityController } from './communication-ai-activity.controller';
import { CommunicationAiActivityService } from './communication-ai-activity.service';
import { CommunicationAiActivityRepository } from './communication-ai-activity.repository';

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
  return {
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
    communicationEvent: {
      findMany: jest.fn(async () => []),
    },
  };
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

describe('CommunicationAiActivityController — HTTP security integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CommunicationAiActivityController],
      providers: [
        CommunicationAiActivityService,
        CommunicationAiActivityRepository,
        {
          provide: StationAccessService,
          useValue: {
            resolve: jest.fn(async () => ({
              bypassScope: false,
              allowedStationIds: ['station-a'],
            })),
          },
        },
        OrgScopingGuard,
        PermissionsGuard,
        RolesGuard,
        { provide: PrismaService, useValue: makePrisma() },
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

  const readerA = { id: 'reader', platformRole: 'USER', organizationId: 'org-a' };
  const deniedA = { id: 'denied', platformRole: 'USER', organizationId: 'org-a' };
  const readerB = { id: 'reader', platformRole: 'USER', organizationId: 'org-b' };

  it('allows communication.read holder in own org', async () => {
    await request(app.getHttpServer())
      .get('/organizations/org-a/communication/ai-activity')
      .set(...auth(readerA))
      .expect(200);
  });

  it('denies authenticated user without communication.read', async () => {
    await request(app.getHttpServer())
      .get('/organizations/org-a/communication/ai-activity')
      .set(...auth(deniedA))
      .expect(403);
  });

  it('denies cross-org route via OrgScopingGuard', async () => {
    await request(app.getHttpServer())
      .get('/organizations/org-a/communication/ai-activity')
      .set(...auth(readerB))
      .expect(403);
  });
});
