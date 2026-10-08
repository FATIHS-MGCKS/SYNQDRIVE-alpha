import type { PrismaClient } from '@prisma/client';

/** Compile-time brand — does not enforce DB login at runtime without trusted construction. */
export const M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUER_DB_BRAND = Symbol(
  'M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUER_DB_V1',
);

/**
 * Dedicated PostgreSQL session bound to the isolated attestation issuer DB identity.
 * Must be provisioned by trusted infrastructure (separate credentials / pool) — not the generic app pool.
 */
export type M3_3HvH4A3IntegrityAttestationIssuerDbV1 = PrismaClient & {
  readonly [M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUER_DB_BRAND]: true;
};

/**
 * Trusted construction boundary (CI fixture / future runtime issuer pool factory).
 * Branding alone is not a substitute for PostgreSQL privilege separation.
 */
export function brandM3_3HvH4A3IntegrityAttestationIssuerDbV1(
  client: PrismaClient,
): M3_3HvH4A3IntegrityAttestationIssuerDbV1 {
  const branded = client as M3_3HvH4A3IntegrityAttestationIssuerDbV1;
  if (!branded[M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUER_DB_BRAND]) {
    Object.defineProperty(client, M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUER_DB_BRAND, {
      value: true,
      enumerable: false,
      configurable: false,
    });
  }
  return client as M3_3HvH4A3IntegrityAttestationIssuerDbV1;
}
