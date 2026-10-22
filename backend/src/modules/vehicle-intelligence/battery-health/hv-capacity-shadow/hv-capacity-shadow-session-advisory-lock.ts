import type { PrismaService } from '@shared/database/prisma.service';

export async function withHvShadowSessionAdvisoryLock<T>(
  prisma: PrismaService,
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockScope = `hv-cap-shadow:${sessionId}`;
  await prisma.$executeRaw`SELECT pg_advisory_lock(hashtextextended(${lockScope}, 0))`;
  try {
    return await fn();
  } finally {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(hashtextextended(${lockScope}, 0))`;
  }
}
