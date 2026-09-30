import type { PrismaClient } from '@prisma/client';

/** Minimal read surface for S4F reconciliation (supports PrismaClient and interactive tx clients). */
export type DiV0S4fReadDb = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;
