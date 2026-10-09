/**
 * VO5C-P4A — canonical offboard HTTP guard pipeline + disposable PostgreSQL authority.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  BusinessType,
  PrismaClient,
  ProductSlug,
  UserPlatformRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { MFA_ERROR, STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import {
  buildMfaClaims,
  buildPasswordOnlyClaims,
} from '@shared/auth/auth-session-claims.types';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleOnboardingOffboardController } from './controllers/vehicle-onboarding-offboard.controller';
import { MasterVehicleOffboardAdmissionGuard } from './guards/master-vehicle-offboard-admission.guard';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import {
  MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED_CODE,
  MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE,
} from './policy/master-vehicle-offboard-admission.errors';
import { VehicleOffboardingService } from './services/vehicle-offboarding.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';

const run = process.env.VO5C_P4A_OFFBOARD_HTTP_PG === '1';

const TEST_RELEASE_SHA = 'ab72f574014d6657cac158c253696b7237cdd3e6';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

function auth(user: Record<string, unknown> | null): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5C-P4A ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createActiveVehicle(prisma: PrismaClient, orgId: string) {
  const vehicleId = randomUUID();
  const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, registry_lifecycle,
      status, created_at, updated_at
    ) VALUES (
      ${vehicleId}, ${orgId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType",
      'ACTIVE'::"VehicleRegistryLifecycle",
      'AVAILABLE'::"VehicleStatus",
      NOW(), NOW()
    )
  `;
  return { vehicleId, vin };
}

function offboardRoute(organizationId: string, vehicleId: string) {
  return `/api/v1/admin/vehicle-onboarding/organizations/${organizationId}/vehicles/${vehicleId}/offboard`;
}

function applyAdmittedOffboardEnv() {
  process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED = 'true';
  process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED = 'YES';
  process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA = TEST_RELEASE_SHA;
  process.env.SYNQDRIVE_DEPLOYED_GIT_SHA = TEST_RELEASE_SHA;
  process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'true';
  process.env.IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED = 'false';
}

function clearAdmissionEnv() {
  delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED;
  delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ROUTE_VERIFIED;
  delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_ATTESTED_RELEASE_SHA;
  delete process.env.SYNQDRIVE_DEPLOYED_GIT_SHA;
}

(run ? describe : describe.skip)('VO5C-P4A offboard HTTP security (PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  let stepUpValidate: jest.Mock;
  const originalEnv = process.env;

  const masterWithMfa = {
    id: 'ma-p4a-1',
    platformRole: UserPlatformRole.MASTER_ADMIN,
    sessionClaims: buildMfaClaims(),
  };

  async function ensureMasterAdminMfaEnrollment(userId: string) {
    const email = `${userId}@vo5c-p4a.test`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${userId}, ${email}, 'P4A Master Admin', 'ACTIVE'::"UserStatus",
        'MASTER_ADMIN'::"UserPlatformRole", NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET platform_role = 'MASTER_ADMIN'::"UserPlatformRole"
    `;
    await prisma.$executeRaw`
      INSERT INTO user_mfa_factors (id, user_id, factor_type, enabled_at, verified_at, created_at, updated_at)
      VALUES (
        ${randomUUID()}, ${userId}, 'TOTP'::"MfaFactorType", NOW(), NOW(), NOW(), NOW()
      )
      ON CONFLICT (user_id, factor_type) DO UPDATE SET enabled_at = NOW(), verified_at = NOW()
    `;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureMasterAdminMfaEnrollment(masterWithMfa.id);
    stepUpValidate = jest.fn().mockResolvedValue(false);

    const moduleRef = await Test.createTestingModule({
      controllers: [VehicleOnboardingOffboardController],
      providers: [
        Reflector,
        RolesGuard,
        MasterVehicleOffboardAdmissionGuard,
        MasterAdminMfaGuard,
        VehicleOnboardingOffboardService,
        VehicleOffboardingService,
        VehicleOffboardPreflightService,
        { provide: PrismaService, useValue: prisma },
        { provide: IamMfaStepUpService, useValue: { validateGrant: stepUpValidate } },
        { provide: APP_GUARD, useClass: TestAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
        const header = req.headers['x-test-user'];
        if (header && header !== 'null') req.user = JSON.parse(header);
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    clearAdmissionEnv();
    process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'false';
    stepUpValidate.mockResolvedValue(false);
  });

  function postOffboard(
    organizationId: string,
    vehicleId: string,
    user: Record<string, unknown> | null,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ) {
    const req = request(app.getHttpServer())
      .post(offboardRoute(organizationId, vehicleId))
      .send(body);
    if (user !== null) req.set(...auth(user));
    for (const [key, value] of Object.entries(extraHeaders)) {
      req.set(key, value);
    }
    return req;
  }

  it('unauthenticated caller denied (401)', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await postOffboard(orgId, vehicleId, null, {
      reason: 'REMOVE_FROM_PRODUCT',
      idempotencyKey: randomUUID(),
    }).expect(401);
  });

  it('tenant user denied (403)', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await postOffboard(
      orgId,
      vehicleId,
      {
        id: 'tenant-1',
        platformRole: 'USER',
        membershipRole: 'ORG_ADMIN',
        organizationId: orgId,
      },
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
    ).expect(403);
  });

  it('wrong platform role denied (403)', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await postOffboard(
      orgId,
      vehicleId,
      { id: 'u1', platformRole: 'USER', membershipRole: 'WORKER', organizationId: orgId },
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
    ).expect(403);
  });

  async function expectNoOffboardMutation(vehicleId: string) {
    const rows = await prisma.$queryRaw<Array<{ registry_lifecycle: string }>>`
      SELECT registry_lifecycle::text AS registry_lifecycle FROM vehicles WHERE id = ${vehicleId}
    `;
    expect(rows[0]?.registry_lifecycle).toBe('ACTIVE');
    const outboxCount = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    expect(outboxCount).toBe(0);
  }

  it('cross-claim USER platform + MASTER_ADMIN membership denied without mutation (admission OFF and ON)', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const crossClaimPrincipal = {
      id: 'cross-claim-membership-ma',
      platformRole: UserPlatformRole.USER,
      membershipRole: 'MASTER_ADMIN',
      organizationId: orgId,
      sessionClaims: buildMfaClaims(),
    };
    const body = { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() };

    const offRes = await postOffboard(orgId, vehicleId, crossClaimPrincipal, body).expect(403);
    expect(offRes.body.code).toBe(MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE);
    await expectNoOffboardMutation(vehicleId);

    applyAdmittedOffboardEnv();
    stepUpValidate.mockResolvedValue(true);
    const onRes = await postOffboard(orgId, vehicleId, crossClaimPrincipal, {
      ...body,
      idempotencyKey: randomUUID(),
    }).expect(403);
    expect(onRes.body.code).toBe(MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE);
    await expectNoOffboardMutation(vehicleId);
  });

  it('backend admission gate OFF rejects MASTER_ADMIN (409)', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'true';
    const res = await postOffboard(
      orgId,
      vehicleId,
      masterWithMfa,
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
    ).expect(409);
    expect(res.body.code).toBe(MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED_CODE);
    expect(res.body.blockReason).toBe('ADMISSION_DISABLED');
  });

  it('stale release attestation denied when admission ON (409)', async () => {
    applyAdmittedOffboardEnv();
    process.env.SYNQDRIVE_DEPLOYED_GIT_SHA = 'cccccccccccccccccccccccccccccccccccccccc';
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const res = await postOffboard(
      orgId,
      vehicleId,
      masterWithMfa,
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
    ).expect(409);
    expect(res.body.blockReason).toBe('RELEASE_ATTESTATION_MISMATCH');
  });

  it('MASTER_ADMIN not enrolled when MFA rollout required (403)', async () => {
    applyAdmittedOffboardEnv();
    const unenrolledId = 'ma-p4a-unenrolled';
    const email = `${unenrolledId}@vo5c-p4a.test`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${unenrolledId}, ${email}, 'P4A Unenrolled', 'ACTIVE'::"UserStatus",
        'MASTER_ADMIN'::"UserPlatformRole", NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`DELETE FROM user_mfa_factors WHERE user_id = ${unenrolledId}`;
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const res = await postOffboard(
      orgId,
      vehicleId,
      {
        id: unenrolledId,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionClaims: buildPasswordOnlyClaims(),
      },
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
    ).expect(403);
    expect(res.body.code).toBe(MFA_ERROR.ENROLLMENT_REQUIRED);
    expect(res.body.action).toBe(STEP_UP_ACTION.MASTER_INTEGRATIONS);
  });

  it('MASTER_ADMIN missing step-up denied (403)', async () => {
    applyAdmittedOffboardEnv();
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const res = await postOffboard(
      orgId,
      vehicleId,
      { ...masterWithMfa, sessionClaims: buildPasswordOnlyClaims() },
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
    ).expect(403);
    expect(
      res.body.code === MFA_ERROR.STEP_UP_REQUIRED ||
        (res.body.message as { code?: string })?.code === MFA_ERROR.STEP_UP_REQUIRED,
    ).toBe(true);
  });

  it('expired step-up token denied (403)', async () => {
    applyAdmittedOffboardEnv();
    stepUpValidate.mockResolvedValue(false);
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const res = await postOffboard(
      orgId,
      vehicleId,
      { ...masterWithMfa, sessionClaims: buildPasswordOnlyClaims() },
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
      { 'x-step-up-token': 'stale-token' },
    ).expect(403);
    expect(
      res.body.code === MFA_ERROR.STEP_UP_EXPIRED ||
        (res.body.message as { code?: string })?.code === MFA_ERROR.STEP_UP_EXPIRED,
    ).toBe(true);
    expect(stepUpValidate).toHaveBeenCalledWith(
      masterWithMfa.id,
      'stale-token',
      STEP_UP_ACTION.MASTER_INTEGRATIONS,
    );
  });

  it('malformed request rejected (422)', async () => {
    applyAdmittedOffboardEnv();
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await postOffboard(orgId, vehicleId, masterWithMfa, { idempotencyKey: 'k1' }).expect(422);
  });

  it('cross-organization vehicle scope fails closed (404)', async () => {
    applyAdmittedOffboardEnv();
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgA);
    await postOffboard(
      orgB,
      vehicleId,
      masterWithMfa,
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
    ).expect(404);
  });

  it('valid MASTER_ADMIN offboard succeeds with response DTO', async () => {
    applyAdmittedOffboardEnv();
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const idempotencyKey = randomUUID();
    const res = await postOffboard(orgId, vehicleId, masterWithMfa, {
      reason: 'REMOVE_FROM_PRODUCT',
      idempotencyKey,
    }).expect(201);
    expect(res.body).toMatchObject({
      vehicleId,
      organizationId: orgId,
      registryLifecycle: 'OFFBOARDED',
      idempotentReplay: false,
    });
    expect(res.body.offboardedAt).toBeDefined();
    const rows = await prisma.$queryRaw<Array<{ registry_lifecycle: string }>>`
      SELECT registry_lifecycle::text AS registry_lifecycle FROM vehicles WHERE id = ${vehicleId}
    `;
    expect(rows[0]?.registry_lifecycle).toBe('OFFBOARDED');
  });

  it('idempotent replay returns same outcome without duplicate outbox', async () => {
    applyAdmittedOffboardEnv();
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const idempotencyKey = randomUUID();
    const body = { reason: 'OFFBOARD_SOLD', idempotencyKey };
    await postOffboard(orgId, vehicleId, masterWithMfa, body).expect(201);
    const replay = await postOffboard(orgId, vehicleId, masterWithMfa, body).expect(201);
    expect(replay.body.idempotentReplay).toBe(true);
    const outboxCount = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    expect(outboxCount).toBe(1);
  });

  it('different idempotency key on OFFBOARDED vehicle fails closed (409)', async () => {
    applyAdmittedOffboardEnv();
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await postOffboard(orgId, vehicleId, masterWithMfa, {
      reason: 'OFFBOARD_SOLD',
      idempotencyKey: randomUUID(),
    }).expect(201);
    const conflict = await postOffboard(orgId, vehicleId, masterWithMfa, {
      reason: 'OFFBOARD_SOLD',
      idempotencyKey: randomUUID(),
    }).expect(422);
    expect(conflict.body.code).toBe('VEHICLE_REGISTRY_INVALID_TRANSITION');
  });

  it('valid step-up header allows offboard when fresh MFA claims absent', async () => {
    applyAdmittedOffboardEnv();
    stepUpValidate.mockResolvedValue(true);
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    await postOffboard(
      orgId,
      vehicleId,
      { ...masterWithMfa, sessionClaims: buildPasswordOnlyClaims() },
      { reason: 'REMOVE_FROM_PRODUCT', idempotencyKey: randomUUID() },
      { 'x-step-up-token': 'valid-grant' },
    ).expect(201);
  });
});
