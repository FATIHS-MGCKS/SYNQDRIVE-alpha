/**
 * Isolated Postgres migration gate for P2-PR3.
 *
 * Run:
 *   P2_PR3_VEHICLE_ACCESS_POSTGRES_MIGRATION=1 \
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1 \
 *   npm test -- --runInBand p2-pr3-vehicle-access-migrations
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  BusinessType,
  OrganizationProductVehicleAccessMode,
  OrgProductPlan,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';
import { assertP2Pr3DisposablePostgresPreflight } from './testing/p2-pr3-disposable-postgres-preflight';

const LIVE = process.env.P2_PR3_VEHICLE_ACCESS_POSTGRES_MIGRATION === '1';
const OPT_IN = 'P2_PR3_VEHICLE_ACCESS_POSTGRES_MIGRATION';

const MIGRATION_BACKFILL_SQL = `
UPDATE "organization_products" AS op
SET "vehicle_access_mode" = CASE
  WHEN p.slug = 'VYMOD' THEN 'SELECTED_VEHICLES'::"OrganizationProductVehicleAccessMode"
  ELSE 'ORGANIZATION_WIDE'::"OrganizationProductVehicleAccessMode"
END
FROM "products" AS p
WHERE op."product_id" = p."id" AND op."vehicle_access_mode" IS NULL;
`;

(LIVE ? describe : describe.skip)('P2-PR3 vehicle access — migrations', () => {
  const prisma = new PrismaClient();
  let grantTableBaselineCount: number;
  const scratchOrgIds: string[] = [];

  beforeAll(async () => {
    assertP2Pr3DisposablePostgresPreflight(OPT_IN);
    grantTableBaselineCount = await prisma.vehicleProductGrant.count();
    expect(grantTableBaselineCount).toBe(0);
  });

  afterAll(async () => {
    if (scratchOrgIds.length) {
      await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: scratchOrgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: scratchOrgIds } } });
    }
    await prisma.$disconnect();
  });

  it('vehicle_product_grants table is empty at migration gate baseline', async () => {
    expect(await prisma.vehicleProductGrant.count()).toBe(grantTableBaselineCount);
    expect(grantTableBaselineCount).toBe(0);
  });

  it('migration backfill sets modes by product slug (RENTAL/FLEET/VYMOD)', async () => {
    const orgId = randomUUID();
    scratchOrgIds.push(orgId);
    await prisma.organization.create({
      data: { id: orgId, companyName: `backfill-${Date.now()}`, businessType: BusinessType.RENTAL },
    });

    const slugs = [ProductSlug.RENTAL, ProductSlug.FLEET, ProductSlug.VYMOD] as const;
    for (const slug of slugs) {
      const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
      await prisma.organizationProduct.create({
        data: {
          organizationId: orgId,
          productId: product.id,
          status: OrgProductStatus.ACTIVE,
          plan: OrgProductPlan.STARTER,
          vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        },
      });
    }

    await prisma.$executeRawUnsafe(`ALTER TABLE "organization_products" ALTER COLUMN "vehicle_access_mode" DROP NOT NULL`);
  try {
    await prisma.$executeRaw`
      UPDATE "organization_products"
      SET "vehicle_access_mode" = NULL
      WHERE "organization_id" = ${orgId}
    `;

    await prisma.$executeRawUnsafe(MIGRATION_BACKFILL_SQL);

    const rows = await prisma.organizationProduct.findMany({
      where: { organizationId: orgId },
      include: { product: { select: { slug: true } } },
    });

    const modeBySlug = Object.fromEntries(
      rows.map((row) => [row.product.slug, row.vehicleAccessMode]),
    ) as Record<string, OrganizationProductVehicleAccessMode>;

    expect(modeBySlug[ProductSlug.RENTAL]).toBe(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    expect(modeBySlug[ProductSlug.FLEET]).toBe(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    expect(modeBySlug[ProductSlug.VYMOD]).toBe(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
  } finally {
    await prisma.$executeRaw`
      UPDATE "organization_products"
      SET "vehicle_access_mode" = 'ORGANIZATION_WIDE'::"OrganizationProductVehicleAccessMode"
      WHERE "organization_id" = ${orgId} AND "vehicle_access_mode" IS NULL
    `;
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "organization_products" ALTER COLUMN "vehicle_access_mode" SET NOT NULL`,
    );
  }
  });

  it('repeated migrate deploy is a no-op', () => {
    assertP2Pr3DisposablePostgresPreflight(OPT_IN);
    const out = execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
    });
    expect(out).toMatch(/No pending migrations|already applied|applied/i);
  });
});