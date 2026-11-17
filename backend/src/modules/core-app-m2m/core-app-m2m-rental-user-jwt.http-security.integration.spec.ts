import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { ProductSlug } from '@prisma/client';
import { AuthGuard } from '@shared/auth/auth.guard';
import {
  CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
  CORE_APP_M2M_JWT_ISSUER_DEFAULT,
  CORE_APP_M2M_TOKEN_TYPE,
} from './core-app-m2m-jwt.config';
import { CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ } from './core-app-m2m.constants';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VEHICLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_JWT_SECRET = 'rental-route-user-jwt-secret';
const M2M_SECRET = 'rental-route-m2m-jwt-secret';

/**
 * Representative Rental surface route shape (vehicle rental-health).
 * Stubs handler only — proves AuthGuard rejects service JWT while accepting user JWT.
 */
@Controller('organizations/:orgId')
class RentalHealthRouteStubController {
  @Get('vehicles/:vehicleId/rental-health')
  getVehicleHealth() {
    return { contract: 'rental-health-stub', ok: true };
  }
}

describe('Core M2M — Rental user-JWT route compatibility (HTTP)', () => {
  let app: INestApplication;
  const envBackup = { ...process.env };
  const rentalRoute = `/api/v1/organizations/${ORG_ID}/vehicles/${VEHICLE_ID}/rental-health`;

  beforeAll(async () => {
    process.env.JWT_SECRET = USER_JWT_SECRET;
    process.env.CORE_APP_M2M_JWT_SECRET = M2M_SECRET;

    const moduleRef = await Test.createTestingModule({
      controllers: [RentalHealthRouteStubController],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = { ...envBackup };
  });

  it('rejects service JWT on rental-health route', async () => {
    const serviceJwt = jwt.sign(
      {
        sub: 'integration-client',
        token_type: CORE_APP_M2M_TOKEN_TYPE,
        organizationId: ORG_ID,
        productSlug: ProductSlug.RENTAL,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
        credentialVersion: 1,
        grantVersion: 1,
      },
      M2M_SECRET,
      {
        issuer: CORE_APP_M2M_JWT_ISSUER_DEFAULT,
        audience: CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
        expiresIn: 300,
      },
    );

    await request(app.getHttpServer())
      .get(rentalRoute)
      .set('Authorization', `Bearer ${serviceJwt}`)
      .expect(401);
  });

  it('accepts valid user JWT on rental-health route', async () => {
    const userJwt = jwt.sign(
      {
        sub: 'rental-user-1',
        email: 'user@test.local',
        platformRole: 'USER',
        organizationId: ORG_ID,
      },
      USER_JWT_SECRET,
      { expiresIn: 300 },
    );

    const res = await request(app.getHttpServer())
      .get(rentalRoute)
      .set('Authorization', `Bearer ${userJwt}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});