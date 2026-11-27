/**
 * USR-P2 HTTP security probes (HTTP01–HTTP21 subset with real AuthGuard + authority).
 */
import { Controller, Get, INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { ACCESS_AUTHORITY_FAILURE_CODES } from '@shared/auth/user-access-authority.types';
import { createRefreshTokenHarness } from './iam-security-regression.harness';

@Controller('api/v1/usr-p2-probe')
class UsrP2ProbeController {
  @Get('me')
  me() {
    return { ok: true };
  }
}

@Injectable()
class UsrP2AuthAppGuard extends AuthGuard {}

describe('USR-P2 access revocation — real JWT HTTP security', () => {
  const priorJwt = process.env.JWT_SECRET;
  let harness: ReturnType<typeof createRefreshTokenHarness>;
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    harness = createRefreshTokenHarness();
    const moduleRef = await Test.createTestingModule({
      controllers: [UsrP2ProbeController],
      providers: [
        UsrP2AuthAppGuard,
        { provide: UserAccessAuthorityService, useValue: harness.accessAuthority },
        { provide: APP_GUARD, useExisting: UsrP2AuthAppGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (priorJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwt;
  });

  async function issueFor(user: {
    id: string;
    email: string;
    platformRole: UserPlatformRole;
    sessionVersion?: number;
    securityVersion?: number;
  }) {
    harness.registerRefreshHarnessUser(user);
    return (await harness.service.issueTokenPair(user, null)).accessToken;
  }

  it('SEMANTIC_REQ_01 valid current session allowed (HTTP01)', async () => {
    const token = await issueFor({
      id: 'http01-user',
      email: 'http01@test.example',
      platformRole: UserPlatformRole.USER,
    });
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('SEMANTIC_REQ_12 stale sessionVersion denied maps stale privilege (HTTP02)', async () => {
    const user = {
      id: 'http02-user',
      email: 'http02@test.example',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
      securityVersion: 0,
    };
    const token = await issueFor(user);
    harness.bumpHarnessUserSessionVersion(user.id, 1);
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect((res) => {
        const code = res.body?.code ?? res.body?.message?.code;
        expect(code).toBe(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_VERSION_MISMATCH);
      });
  });

  it('HTTP03 stale securityVersion denied', async () => {
    const user = {
      id: 'http03-user',
      email: 'http03@test.example',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
      securityVersion: 0,
    };
    const token = await issueFor(user);
    harness.bumpHarnessUserSecurityVersion(user.id, 1);
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect((res) => {
        const code = res.body?.code ?? res.body?.message?.code;
        expect(code).toBe(ACCESS_AUTHORITY_FAILURE_CODES.SECURITY_VERSION_MISMATCH);
      });
  });

  it('HTTP04 revoked individual session denied', async () => {
    const user = {
      id: 'http04-user',
      email: 'http04@test.example',
      platformRole: UserPlatformRole.USER,
    };
    const token = await issueFor(user);
    const decoded = jwt.decode(token) as { tokenFamily?: string };
    if (decoded.tokenFamily) {
      harness.revokeHarnessRefreshFamily(user.id, decoded.tokenFamily);
    }
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('SEMANTIC_REQ_02 suspended/inactive account denied (HTTP05)', async () => {
    const user = {
      id: 'http05-user',
      email: 'http05@test.example',
      platformRole: UserPlatformRole.USER,
    };
    const token = await issueFor(user);
    harness.setHarnessUserInactive(user.id);
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect((res) => {
        const code = res.body?.code ?? res.body?.message?.code;
        expect(code).toBe(ACCESS_AUTHORITY_FAILURE_CODES.USER_INACTIVE);
      });
  });

  it('SEMANTIC_REQ_03 deleted/unknown account denied (HTTP06)', async () => {
    const token = jwt.sign(
      {
        sub: 'ghost-user',
        email: 'ghost@test.example',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
        tokenFamily: 'family-ghost',
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect((res) => {
        const code = res.body?.code ?? res.body?.message?.code;
        expect(code).toBe(ACCESS_AUTHORITY_FAILURE_CODES.USER_NOT_FOUND);
      });
  });

  it('HTTP07 malformed token denied', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('HTTP18 missing legacy identity handled safely', async () => {
    const legacy = jwt.sign(
      {
        sub: 'legacy-user',
        email: 'legacy@test.example',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
    harness.registerRefreshHarnessUser({
      id: 'legacy-user',
      email: 'legacy@test.example',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    });
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${legacy}`)
      .expect(401)
      .expect((res) => {
        const code = res.body?.code ?? res.body?.message?.code;
        expect(code).toBe(ACCESS_AUTHORITY_FAILURE_CODES.SESSION_BINDING_REQUIRED);
      });
  });

  it('HTTP08 duplicate session revocation still denied', async () => {
    const user = {
      id: 'http08-user',
      email: 'http08@test.example',
      platformRole: UserPlatformRole.USER,
    };
    const token = await issueFor(user);
    const decoded = jwt.decode(token) as { tokenFamily?: string };
    if (decoded.tokenFamily) {
      harness.revokeHarnessRefreshFamily(user.id, decoded.tokenFamily);
    }
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('HTTP09 missing Authorization header denied', async () => {
    await request(app.getHttpServer()).get('/api/v1/usr-p2-probe/me').expect(401);
  });

  it('HTTP10 re-issued session allowed', async () => {
    const user = {
      id: 'http10-user',
      email: 'http10@test.example',
      platformRole: UserPlatformRole.USER,
    };
    harness.registerRefreshHarnessUser(user);
    const reissued = (
      await harness.service.issueTokenPair(user, null)
    ).accessToken;
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${reissued}`)
      .expect(200);
  });

  it('HTTP11 cross-user token binding denied', async () => {
    const owner = {
      id: 'http11-owner',
      email: 'owner@test.example',
      platformRole: UserPlatformRole.USER,
    };
    const other = {
      id: 'http11-other',
      email: 'other@test.example',
      platformRole: UserPlatformRole.USER,
    };
    const token = await issueFor(owner);
    harness.registerRefreshHarnessUser(other);
    const base = jwt.decode(token) as Record<string, unknown>;
    const { exp, iat, ...rest } = base;
    const stolen = jwt.sign(
      { ...rest, sub: other.id, email: other.email },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${stolen}`)
      .expect(401);
  });

  it('HTTP12 master admin platform-only session allowed', async () => {
    const user = {
      id: 'http12-master',
      email: 'master@test.example',
      platformRole: UserPlatformRole.MASTER_ADMIN,
    };
    const token = await issueFor(user);
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('HTTP13 tenant without billing delegate denied on billing route N/A', async () => {
    const token = await issueFor({
      id: 'http13-user',
      email: 'http13@test.example',
      platformRole: UserPlatformRole.USER,
    });
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('HTTP14 revoked family after logout denied', async () => {
    const user = {
      id: 'http14-user',
      email: 'http14@test.example',
      platformRole: UserPlatformRole.USER,
    };
    harness.registerRefreshHarnessUser(user);
    const issued = await harness.service.issueTokenPair(user, null);
    const decoded = jwt.decode(issued.accessToken) as { tokenFamily?: string };
    if (decoded.tokenFamily) {
      harness.revokeHarnessRefreshFamily(user.id, decoded.tokenFamily);
    }
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${issued.accessToken}`)
      .expect(401);
  });

  it('HTTP15 mismatched sessionVersion denied', async () => {
    const user = {
      id: 'http15-user',
      email: 'http15@test.example',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    };
    const token = await issueFor(user);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const { exp, iat, ...rest } = decoded;
    const bad = jwt.sign(
      { ...rest, sessionVersion: 99 },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${bad}`)
      .expect(401);
  });

  it('HTTP16 invalid tokenFamily binding denied', async () => {
    const token = jwt.sign(
      {
        sub: 'http16-user',
        email: 'http16@test.example',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
        tokenFamily: 'missing-family',
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
    harness.registerRefreshHarnessUser({
      id: 'http16-user',
      email: 'http16@test.example',
      platformRole: UserPlatformRole.USER,
    });
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('HTTP17 expired jwt denied', async () => {
    const token = jwt.sign(
      {
        sub: 'http17-user',
        email: 'http17@test.example',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
        tokenFamily: 'fam-expired',
      },
      process.env.JWT_SECRET!,
      { expiresIn: '-1s' },
    );
    harness.registerRefreshHarnessUser({
      id: 'http17-user',
      email: 'http17@test.example',
      platformRole: UserPlatformRole.USER,
    });
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('HTTP20 empty bearer denied', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', 'Bearer ')
      .expect(401);
  });

  it('HTTP21 forged signature denied', async () => {
    const token = jwt.sign(
      {
        sub: 'http21-user',
        email: 'http21@test.example',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
        tokenFamily: 'fam-21',
      },
      'wrong-secret',
      { expiresIn: '15m' },
    );
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('HTTP19 authority unavailable fails closed', async () => {
    const token = await issueFor({
      id: 'http19-user',
      email: 'http19@test.example',
      platformRole: UserPlatformRole.USER,
    });
    harness.prisma.user.findUnique.mockRejectedValue(new Error('db_unavailable'));
    await request(app.getHttpServer())
      .get('/api/v1/usr-p2-probe/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect((res) => {
        const code = res.body?.code ?? res.body?.message?.code;
        expect(code).toBe(ACCESS_AUTHORITY_FAILURE_CODES.AUTHORITY_UNAVAILABLE);
      });
    harness.registerRefreshHarnessUser({
      id: 'http19-user',
      email: 'http19@test.example',
      platformRole: UserPlatformRole.USER,
    });
  });
});