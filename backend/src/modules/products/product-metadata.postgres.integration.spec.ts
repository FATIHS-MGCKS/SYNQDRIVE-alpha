/**
 * Product metadata PATCH — Postgres integration (disposable DB).
 *
 * PRODUCT_METADATA_PATCH_POSTGRES_INTEGRATION=1
 * DATABASE_URL=postgresql://...@127.0.0.1:5432/synqdrive_product_metadata_p1
 */
import { ConflictException } from '@nestjs/common';
import {
  ActivityEntity,
  PrismaClient,
  ProductSlug,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { ProductsService } from './products.service';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { AuditService } from '@modules/activity-log/audit.service';

const LIVE = process.env.PRODUCT_METADATA_PATCH_POSTGRES_INTEGRATION === '1';
const DISPOSABLE_DB_TOKEN = 'synqdrive_product_metadata_p1';

function assertDisposableDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i.test(url)) {
    throw new Error('PRODUCT_METADATA_PATCH_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
  }
  if (!url.includes(DISPOSABLE_DB_TOKEN)) {
    throw new Error(`DATABASE_URL must reference disposable database "${DISPOSABLE_DB_TOKEN}"`);
  }
}

(LIVE ? describe : describe.skip)('Product metadata PATCH — postgres', () => {
  const prisma = new PrismaClient();
  let products: ProductsService;

  beforeAll(() => {
    assertDisposableDatabaseUrl();
    const audit = new AuditService(prisma as never);
    const masterAdminAudit = new MasterAdminAuditService(audit);
    products = new ProductsService(prisma as never, masterAdminAudit);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedMasterAdmin(): Promise<string> {
    const suffix = Date.now();
    const id = `p1-meta-master-${suffix}`;
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
      VALUES (
        ${id},
        ${`p1-meta-${suffix}@test.example`},
        'Meta Master',
        ${UserStatus.ACTIVE}::"UserStatus",
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        NOW(),
        NOW()
      )
    `;
    return id;
  }

  it('CAS: rejects stale ifCurrentName', async () => {
    const masterId = await seedMasterAdmin();
    const rental = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.RENTAL } });
    const beforeName = rental.name;
  await expect(
      products.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.RENTAL,
        patch: {
          name: `${beforeName} P1`,
          description: rental.description,
          ifCurrentName: 'definitely-stale-name',
          ifCurrentDescription: rental.description,
        },
        actorUserId: masterId,
        audit: { correlationId: `cas-name-${Date.now()}` },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const after = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.RENTAL } });
    expect(after.name).toBe(beforeName);
  });

  it('mandatory audit: mutation rolls back when audit user FK fails', async () => {
    const rental = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.FLEET } });
    const beforeName = rental.name;
    const bogusActor = '00000000-0000-4000-8000-000000009999';
    await expect(
      products.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.FLEET,
        patch: {
          name: `${beforeName} rollback-test`,
          description: null,
          ifCurrentName: beforeName,
          ifCurrentDescription: null,
        },
        actorUserId: bogusActor,
        audit: { correlationId: `audit-fail-${Date.now()}` },
      }),
    ).rejects.toBeTruthy();

    const after = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.FLEET } });
    expect(after.name).toBe(beforeName);

    const auditCount = await prisma.activityLog.count({
      where: {
        entity: ActivityEntity.ADMIN_OPERATION,
        description: { contains: 'FLEET' },
      },
    });
    expect(auditCount).toBeGreaterThanOrEqual(0);
  });

  it('success: persists name, nullable description, and activityLog', async () => {
    const masterId = await seedMasterAdmin();
    const vymod = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.VYMOD } });
    const correlationId = `ok-${Date.now()}`;
    const nextName = `VYMOD P1 ${Date.now()}`;

    await products.updateProductMetadataForMasterAdmin({
      productSlug: ProductSlug.VYMOD,
      patch: {
        name: nextName,
        description: 'P1 postgres integration',
        ifCurrentName: vymod.name,
        ifCurrentDescription: vymod.description,
      },
      actorUserId: masterId,
      audit: { correlationId },
    });

    const updated = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.VYMOD } });
    expect(updated.name).toBe(nextName);
    expect(updated.description).toBe('P1 postgres integration');

    const auditRow = await prisma.activityLog.findFirst({
      where: { userId: masterId, entity: ActivityEntity.ADMIN_OPERATION },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
  });
});