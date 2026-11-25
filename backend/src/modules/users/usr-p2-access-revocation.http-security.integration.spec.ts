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

  it('HTTP01 valid current session allowed', async () => {
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

  it('HTTP02 stale sessionVersion denied', async () => {
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

  it('HTTP05 inactive user denied', async () => {
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

  it('HTTP06 unknown user denied', async () => {
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