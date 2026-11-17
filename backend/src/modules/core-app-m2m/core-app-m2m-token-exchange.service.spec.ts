import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import {
  CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE,
} from './core-app-m2m-auth.constants';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import {
  CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
  CORE_APP_M2M_JWT_ISSUER_DEFAULT,
  CORE_APP_M2M_TOKEN_CONTRACT_VERSION,
  CORE_APP_M2M_TOKEN_TYPE,
} from './core-app-m2m-jwt.config';
import { CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ } from './core-app-m2m.constants';

describe('CoreAppM2mTokenExchangeService', () => {
  const prisma = {
    coreAppServiceClient: { findUnique: jest.fn() },
    organizationProduct: { findFirst: jest.fn() },
  };
  let service: CoreAppM2mTokenExchangeService;
  const envBackup = { ...process.env };
  const m2mSecret = 'p3-pr2-m2m-jwt-signing-secret-isolated';

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_JWT_SECRET = m2mSecret;
    process.env.JWT_SECRET = 'user-jwt-secret-must-not-accept-m2m';
    service = new CoreAppM2mTokenExchangeService(prisma as never);
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function expectAuthFailed(promise: Promise<unknown>): Promise<void> {
    return expect(promise).rejects.toMatchObject({
      response: { message: CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE },
    });
  }

  async function seedHappyPath(overrides: Record<string, unknown> = {}) {
    const clientSecret = 'test-client-secret-value';
    const hash = await bcrypt.hash(clientSecret, 4);
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      clientId: 'fleet-app-1',
      credentialHash: hash,
      credentialVersion: 2,
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ, 'core:app:vehicle:read'],
      orgGrants: [
        {
          organizationId: '11111111-1111-4111-8111-111111111111',
          status: CoreAppServiceGrantStatus.ACTIVE,
          grantVersion: 3,
        },
      ],
      ...overrides,
    });
    prisma.organizationProduct.findFirst.mockResolvedValue({
      status: OrgProductStatus.ACTIVE,
    });
    return { clientSecret };
  }

  it('fail-closes in production when enabled but not production-ready', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_PRODUCTION_READY = 'false';
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'x',
        clientSecret: 'y',
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
    expect(prisma.coreAppServiceClient.findUnique).not.toHaveBeenCalled();
    process.env.NODE_ENV = 'test';
  });

  it('allows issuance in production only when production-ready attestation set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORE_APP_M2M_PRODUCTION_READY = 'true';
    const { clientSecret } = await seedHappyPath();
    const result = await service.exchangeToken({
      clientId: 'fleet-app-1',
      clientSecret,
      organizationId: '11111111-1111-4111-8111-111111111111',
      scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
    });
    expect(result.accessToken).toBeDefined();
    process.env.NODE_ENV = 'test';
    delete process.env.CORE_APP_M2M_PRODUCTION_READY;
  });

  it('fail-closes when M2M JWT secret equals user JWT_SECRET', async () => {
    process.env.JWT_SECRET = 'duplicate-domain-secret';
    process.env.CORE_APP_M2M_JWT_SECRET = 'duplicate-domain-secret';
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret: 'x',
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
    expect(prisma.coreAppServiceClient.findUnique).not.toHaveBeenCalled();
  });

  it('fail-closes when runtime disabled', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'false';
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'x',
        clientSecret: 'y',
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
    expect(prisma.coreAppServiceClient.findUnique).not.toHaveBeenCalled();
  });

  it('fail-closes when signing secret missing while enabled', async () => {
    delete process.env.CORE_APP_M2M_JWT_SECRET;
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'x',
        clientSecret: 'y',
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
  });

  it('issues token for valid client, grant, and ACTIVE entitlement', async () => {
    const { clientSecret } = await seedHappyPath();
    const orgId = '11111111-1111-4111-8111-111111111111';
    const result = await service.exchangeToken({
      clientId: 'fleet-app-1',
      clientSecret,
      organizationId: orgId,
      scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
    });

    expect(result.contractVersion).toBe(CORE_APP_M2M_TOKEN_CONTRACT_VERSION);
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBeGreaterThan(0);

    const decoded = jwt.verify(result.accessToken, m2mSecret, {
      issuer: CORE_APP_M2M_JWT_ISSUER_DEFAULT,
      audience: CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
    }) as jwt.JwtPayload;

    expect(decoded.token_type).toBe(CORE_APP_M2M_TOKEN_TYPE);
    expect(decoded.sub).toBe('fleet-app-1');
    expect(decoded.organizationId).toBe(orgId);
    expect(decoded.productSlug).toBe(ProductSlug.FLEET);
    expect(decoded.credentialVersion).toBe(2);
    expect(decoded.grantVersion).toBe(3);
    expect(decoded.scopes).toEqual([CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ]);
    expect(() => jwt.verify(result.accessToken, process.env.JWT_SECRET!)).toThrow();
  });

  it('rejects invalid credential without leaking existence', async () => {
    await seedHappyPath();
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret: 'wrong-secret',
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
  });

  it('rejects unknown client with generic error', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue(null);
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'missing',
        clientSecret: 'secret',
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
  });

  it('rejects disabled client, revoked grant, TRIAL entitlement, scope escalation, TAXI', async () => {
    const { clientSecret } = await seedHappyPath({
      status: CoreAppServiceClientStatus.DISABLED,
    });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );

    await seedHappyPath({
      orgGrants: [
        {
          organizationId: '11111111-1111-4111-8111-111111111111',
          status: CoreAppServiceGrantStatus.REVOKED,
          grantVersion: 1,
        },
      ],
    });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );

    await seedHappyPath();
    prisma.organizationProduct.findFirst.mockResolvedValue({
      status: OrgProductStatus.TRIAL,
    });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );

    await seedHappyPath();
    prisma.organizationProduct.findFirst.mockResolvedValue({
      status: OrgProductStatus.ACTIVE,
    });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: ['core:app:vehicles:read'],
      }),
    );

    await seedHappyPath({ productSlug: ProductSlug.TAXI });
    prisma.organizationProduct.findFirst.mockResolvedValue({
      status: OrgProductStatus.ACTIVE,
    });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
  });

  it('rejects foreign organization without grant and missing entitlement', async () => {
    const { clientSecret } = await seedHappyPath();
    const foreignOrg = '22222222-2222-4222-8222-222222222222';
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      clientId: 'fleet-app-1',
      credentialHash: (await bcrypt.hash(clientSecret, 4)),
      credentialVersion: 1,
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      orgGrants: [],
    });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: foreignOrg,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );

    await seedHappyPath();
    prisma.organizationProduct.findFirst.mockResolvedValue(null);
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
  });

  it('rejects client when stored allowedScopes mixes valid and unknown scopes', async () => {
    const { clientSecret } = await seedHappyPath({
      allowedScopes: [
        CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ,
        'core:app:unknown:stored-scope',
      ],
    });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
  });

  it('rejects unknown scope definitions and empty allowedScopes configuration', async () => {
    const { clientSecret } = await seedHappyPath();
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: ['core:app:unknown:scope'],
      }),
    );

    await seedHappyPath({ allowedScopes: [] });
    await expectAuthFailed(
      service.exchangeToken({
        clientId: 'fleet-app-1',
        clientSecret,
        organizationId: '11111111-1111-4111-8111-111111111111',
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      }),
    );
  });

  it('always throws UnauthorizedException shape', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'false';
    await expect(service.exchangeToken({
      clientId: 'a',
      clientSecret: 'b',
      organizationId: '11111111-1111-4111-8111-111111111111',
      scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});