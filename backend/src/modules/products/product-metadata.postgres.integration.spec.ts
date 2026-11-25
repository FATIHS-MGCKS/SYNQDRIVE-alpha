/**
 * Product metadata PATCH — Postgres integration (disposable DB).
 *
 * PRODUCT_METADATA_PATCH_POSTGRES_INTEGRATION=1
 * DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_product_metadata_p1
 */
import { ConflictException } from '@nestjs/common';
import {
  ActivityEntity,
  Prisma,
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

async function countAuditByCorrelationId(prisma: PrismaClient, correlationId: string): Promise<number> {
  return prisma.activityLog.count({
    where: {
      entity: ActivityEntity.ADMIN_OPERATION,
      metaJson: {
        path: ['correlationId'],
        equals: correlationId,
      },
    },
  });
}

(LIVE ? describe : describe.skip)('Product metadata PATCH — postgres', () => {
  const prisma = new PrismaClient();
  let products: ProductsService;
  const seededMasterIds: string[] = [];
  const productRestores: Array<{ slug: ProductSlug; name: string; description: string | null }> = [];

  beforeAll(() => {
    assertDisposableDatabaseUrl();
    const audit = new AuditService(prisma as never);
    const masterAdminAudit = new MasterAdminAuditService(audit);
    products = new ProductsService(prisma as never, masterAdminAudit);
  });

  afterAll(async () => {
    for (const restore of productRestores) {
      await prisma.product.update({
        where: { slug: restore.slug },
        data: { name: restore.name, description: restore.description },
      });
    }
    // activity_logs is append-only in migrated DBs; disposable CI drops the whole database.
    if (seededMasterIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: seededMasterIds } } }).catch(() => undefined);
    }
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
    seededMasterIds.push(id);
    return id;
  }

  function snapshotProduct(slug: ProductSlug) {
    return prisma.product.findUniqueOrThrow({ where: { slug } });
  }

  it('CAS: rejects stale ifCurrentName without mutating product', async () => {
    await seedMasterAdmin();
    const rental = await snapshotProduct(ProductSlug.RENTAL);
    const beforeName = rental.name;
    const correlationId = `cas-name-${Date.now()}`;

    await expect(
      products.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.RENTAL,
        patch: {
          name: `${beforeName} P1`,
          description: rental.description,
          ifCurrentName: 'definitely-stale-name',
          ifCurrentDescription: rental.description,
        },
        actorUserId: seededMasterIds.at(-1)!,
        audit: { correlationId },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const after = await snapshotProduct(ProductSlug.RENTAL);
    expect(after.name).toBe(beforeName);
    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(0);
  });

  it('CAS: rejects stale nullable ifCurrentDescription', async () => {
    const masterId = await seedMasterAdmin();
    const fleet = await snapshotProduct(ProductSlug.FLEET);
    const correlationId = `cas-desc-${Date.now()}`;

    await expect(
      products.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.FLEET,
        patch: {
          name: fleet.name,
          description: 'nullable cas probe',
          ifCurrentName: fleet.name,
          ifCurrentDescription: 'stale-non-null-description',
        },
        actorUserId: masterId,
        audit: { correlationId },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const after = await snapshotProduct(ProductSlug.FLEET);
    expect(after.description).toEqual(fleet.description);
    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(0);
  });

  it('mandatory audit: mutation rolls back when audit user FK fails; no audit row', async () => {
    const fleet = await snapshotProduct(ProductSlug.FLEET);
    const beforeName = fleet.name;
    const bogusActor = '00000000-0000-4000-8000-000000009999';
    const correlationId = `audit-fail-${Date.now()}`;

    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(0);

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
        audit: { correlationId },
      }),
    ).rejects.toBeTruthy();

    const after = await snapshotProduct(ProductSlug.FLEET);
    expect(after.name).toBe(beforeName);
    expect(await countAuditByCorrelationId(prisma, correlationId)).toBe(0);
  });

  it('success: persists metadata and writes one audit row for correlationId', async () => {
    const masterId = await seedMasterAdmin();
    const vymod = await snapshotProduct(ProductSlug.VYMOD);
    productRestores.push({ slug: ProductSlug.VYMOD, name: vymod.name, description: vymod.description });
    const correlationId = `ok-${Date.now()}`;
    const nextName = `VYMOD P1 PG ${Date.now()}`;

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

    const updated = await snapshotProduct(ProductSlug.VYMOD);
    expect(updated.name).toBe(nextName);
    expect(updated.description).toBe('P1 postgres integration');

    const auditMatches = await countAuditByCorrelationId(prisma, correlationId);
    expect(auditMatches).toBe(1);

    const auditRow = await prisma.activityLog.findFirst({
      where: {
        userId: masterId,
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: vymod.id,
        metaJson: {
          path: ['correlationId'],
          equals: correlationId,
        } as Prisma.JsonFilter,
      },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.description).toContain('VYMOD');
  });
});