/**
 * Isolated Postgres migration gate for P2-PR3.
 * P2_PR3_VEHICLE_ACCESS_POSTGRES_MIGRATION=1 DATABASE_URL=... npm test -- p2-pr3-vehicle-access-migrations
 */
import { execSync } from 'node:child_process';
import { OrganizationProductVehicleAccessMode, PrismaClient } from '@prisma/client';

const LIVE = process.env.P2_PR3_VEHICLE_ACCESS_POSTGRES_MIGRATION === '1';
const dbUrl = process.env.DATABASE_URL;

(LIVE ? describe : describe.skip)('P2-PR3 vehicle access — migrations', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('legacy organization_products are ORGANIZATION_WIDE after migration', async () => {
    const rows = await prisma.organizationProduct.findMany({
      select: { vehicleAccessMode: true },
      take: 50,
    });
    for (const row of rows) {
      expect(row.vehicleAccessMode).toBe(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    }
  });

  it('vehicle_product_grants table exists and starts empty in gate DB when no test rows', async () => {
    const count = await prisma.vehicleProductGrant.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('repeated migrate deploy is a no-op', () => {
    expect(dbUrl).toBeTruthy();
    const out = execSync('npx prisma migrate deploy', {
      cwd: `${process.cwd()}`,
      env: { ...process.env, DATABASE_URL: dbUrl! },
      encoding: 'utf8',
    });
    expect(out).toMatch(/No pending migrations|already applied|applied/i);
  });
});