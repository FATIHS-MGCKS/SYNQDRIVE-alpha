import { PrismaClient } from '@prisma/client';

export async function probeFuelStationPostgresDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'osm' AND table_name = 'fuel_stations'
      ) AS exists
    `;
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
