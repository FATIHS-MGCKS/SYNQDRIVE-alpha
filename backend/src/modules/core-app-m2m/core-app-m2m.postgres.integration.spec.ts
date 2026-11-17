/**
 * Disposable Postgres gate for P3-PR1 service client registry tables.
 *
 * Run:
 *   CORE_APP_M2M_POSTGRES_INTEGRATION=1 \
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1 \
 *   npm test -- --runInBand core-app-m2m.postgres
 */
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertCoreAppM2mDisposablePostgresPreflight } from './testing/core-app-m2m-disposable-postgres-preflight';

const LIVE = process.env.CORE_APP_M2M_POSTGRES_INTEGRATION === '1';
const OPT_IN = 'CORE_APP_M2M_POSTGRES_INTEGRATION';

(LIVE ? describe : describe.skip)('Core app M2M registry — postgres integration', () => {
  const prisma = new PrismaClient();

  beforeAll(() => {
    assertCoreAppM2mDisposablePostgresPreflight(OPT_IN);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('defaults new clients to DISABLED and grants to REVOKED', async () => {
    const org = await prisma.organization.create({
      data: { companyName: `M2M defaults ${Date.now()}`, businessType: 'RENTAL' },
    });

    const client = await prisma.coreAppServiceClient.create({
      data: {
        clientId: `m2m-defaults-${Date.now()}`,
        displayName: 'Defaults test',
        productSlug: ProductSlug.RENTAL,
        credentialHash: await bcrypt.hash('disposable-test-only', 4),
      },
    });
    expect(client.status).toBe(CoreAppServiceClientStatus.DISABLED);

    const grant = await prisma.coreAppServiceOrgGrant.create({
      data: { serviceClientId: client.id, organizationId: org.id },
    });
    expect(grant.status).toBe(CoreAppServiceGrantStatus.REVOKED);

    await prisma.coreAppServiceOrgGrant.delete({ where: { id: grant.id } });
    await prisma.coreAppServiceClient.delete({ where: { id: client.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('enforces client_id and org grant uniqueness and FK cascade', async () => {
    const org = await prisma.organization.create({
      data: { companyName: `M2M constraints ${Date.now()}`, businessType: 'FLEET' },
    });

    const client = await prisma.coreAppServiceClient.create({
      data: {
        clientId: `m2m-constraints-${Date.now()}`,
        displayName: 'Constraints',
        productSlug: ProductSlug.FLEET,
        credentialHash: 'bcrypt-hash-placeholder-not-plaintext',
        allowedScopes: ['core:entitlements:read'],
      },
    });

    await expect(
      prisma.coreAppServiceClient.create({
        data: {
          clientId: client.clientId,
          displayName: 'dup',
          productSlug: ProductSlug.FLEET,
          credentialHash: 'hash',
        },
      }),
    ).rejects.toBeDefined();

    const grant = await prisma.coreAppServiceOrgGrant.create({
      data: { serviceClientId: client.id, organizationId: org.id },
    });

    await expect(
      prisma.coreAppServiceOrgGrant.create({
        data: { serviceClientId: client.id, organizationId: org.id },
      }),
    ).rejects.toBeDefined();

    await prisma.coreAppServiceClient.delete({ where: { id: client.id } });
    const orphanGrant = await prisma.coreAppServiceOrgGrant.findUnique({ where: { id: grant.id } });
    expect(orphanGrant).toBeNull();

    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('does not mutate existing OrganizationProduct rows', async () => {
    const before = await prisma.organizationProduct.count();
    const org = await prisma.organization.create({
      data: { companyName: `M2M parity ${Date.now()}`, businessType: 'RENTAL' },
    });
    const afterOrg = await prisma.organizationProduct.count();
    expect(afterOrg).toBe(before);

    await prisma.organization.delete({ where: { id: org.id } });
  });
});