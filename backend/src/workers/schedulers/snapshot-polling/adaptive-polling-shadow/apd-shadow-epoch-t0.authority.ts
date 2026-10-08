import { Prisma } from '@prisma/client';

/**
 * Authoritative PostgreSQL clock for immutable APDS Shadow T0.
 * `NOW()` / `CURRENT_TIMESTAMP` return timestamptz (absolute instant), session-TZ independent.
 */
export const APD_SHADOW_EPOCH_T0_SQL = Prisma.sql`SELECT NOW() AS activated_at`;

/** Maximum allowed skew between T0 and database clock at activation (ms). */
export const APD_SHADOW_T0_CLOCK_TOLERANCE_MS = 2_500;
