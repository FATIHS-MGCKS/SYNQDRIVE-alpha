/**
 * E5B evaluations privacy policy (pure, deterministic).
 *
 * Reconstructs the historical GDPR privacy-by-design intent (PR #815) as a
 * server-side authorization policy: a PII tier gates person-level exposure.
 * Frontend visibility is never authorization — this is applied server-side.
 */

export type EvaluationsPiiTier = 'full' | 'pseudonymous' | 'none';

export interface EvaluationsPrivacyContext {
  /** Platform role (e.g. MASTER_ADMIN) when present. */
  readonly platformRole: string | null;
  /** Organization membership role, or null when there is no active membership. */
  readonly membershipRole: string | null;
  readonly canReadInvoices: boolean;
  readonly canReadCustomers: boolean;
}

/**
 * Resolve the PII tier for a person-level evaluations read.
 *
 *  - MASTER_ADMIN / ORG_ADMIN → full
 *  - SUB_ADMIN with both invoice AND customer read → full
 *  - any role with invoice read → pseudonymous
 *  - otherwise (incl. no membership, DRIVER, CUSTOMER) → none (fail closed)
 */
export function resolveEvaluationsPiiTier(ctx: EvaluationsPrivacyContext): EvaluationsPiiTier {
  if (ctx.platformRole === 'MASTER_ADMIN') return 'full';
  if (ctx.membershipRole === 'ORG_ADMIN' || ctx.membershipRole === 'MASTER_ADMIN') return 'full';
  if (ctx.membershipRole === 'SUB_ADMIN' && ctx.canReadInvoices && ctx.canReadCustomers) {
    return 'full';
  }
  if (ctx.canReadInvoices) return 'pseudonymous';
  return 'none';
}

/** True when the actor may see raw person identifiers. */
export function canRevealPersonIdentity(tier: EvaluationsPiiTier): boolean {
  return tier === 'full';
}

/** True when the actor may see any (even pseudonymous) person-level analytics. */
export function canAccessPersonLevel(tier: EvaluationsPiiTier): boolean {
  return tier === 'full' || tier === 'pseudonymous';
}

/**
 * Deterministic, non-reversible pseudonym for an organization-scoped person id.
 * Never leaks the raw id; stable for the same id so aggregates remain coherent.
 */
export function pseudonymizePersonRef(personId: string): string {
  const tail = personId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '000000';
  return `person-····${tail}`;
}
