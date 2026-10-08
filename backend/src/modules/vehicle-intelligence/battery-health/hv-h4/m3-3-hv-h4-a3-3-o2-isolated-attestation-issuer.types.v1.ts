import type { PrismaClient } from '@prisma/client';

/**
 * Dedicated PostgreSQL session bound to the isolated attestation issuer DB identity.
 * Must be provisioned by trusted infrastructure (separate credentials / pool) — not the generic app pool.
 */
export type M3_3HvH4A3IntegrityAttestationIssuerDbV1 = PrismaClient;
