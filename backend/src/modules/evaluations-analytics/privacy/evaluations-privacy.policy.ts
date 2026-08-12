/**
 * E5B/E5.1B evaluations privacy policy (pure, deterministic).
 *
 * A server-side PII tier gates person-level exposure. Frontend visibility is
 * never authorization. E5.1B hardening:
 *  - person identity (`full`) requires an explicit person-identity authority
 *    (`customers.read`), not merely invoice access;
 *  - pseudonymous person-level analytics requires the evaluations analytics
 *    authority (`evaluations.read`);
 *  - pseudonyms are keyed, versioned HMACs with no original-ID fragment.
 */
import { createHmac } from 'node:crypto';

export type EvaluationsPiiTier = 'full' | 'pseudonymous' | 'none';

export const EVALUATIONS_PSEUDONYM_VERSION = 'v1';

export interface EvaluationsPrivacyContext {
  readonly platformRole: string | null;
  readonly membershipRole: string | null;
  /** Person-identity authority (customers module read). */
  readonly canReadCustomers: boolean;
  /** Evaluations analytics authority (evaluations module read). */
  readonly canReadEvaluations: boolean;
}

/**
 * Roles whose org membership is the DRIVER role. A DRIVER is a person-level data
 * SUBJECT, never an authorized viewer of person-level Driver Influence analytics.
 * This is a person-level privacy boundary that is strictly stricter than general
 * module read permissions.
 */
const EVALUATIONS_PERSON_LEVEL_DENIED_MEMBERSHIP_ROLES = new Set<string>(['DRIVER']);

/**
 * Resolve the PII tier for a person-level evaluations read.
 *
 *  - MASTER_ADMIN (platform) / ORG_ADMIN → full
 *  - DRIVER membership → none, ALWAYS (E5.2.1 hard deny): a DRIVER never gains
 *    person-level analytics regardless of `evaluations.read`, `customers.read`,
 *    `invoices.read`, or any combination. DRIVER is a data subject, not a viewer.
 *  - any (non-DRIVER) role with `customers.read` (person-identity authority) → full
 *  - any (non-DRIVER) role with `evaluations.read` (analytics authority) → pseudonymous
 *  - otherwise (no membership, no analytics authority) → none
 *
 * `invoices.read` alone NEVER grants person-level analytics (E5.1B correction).
 */
export function resolveEvaluationsPiiTier(ctx: EvaluationsPrivacyContext): EvaluationsPiiTier {
  // Platform master admin oversight is resolved before org-role gating.
  if (ctx.platformRole === 'MASTER_ADMIN') return 'full';
  // Person-level privacy boundary: DRIVER is hard-denied before any
  // permission-based grant can apply (documented authority: DRIVER → none).
  if (ctx.membershipRole !== null && EVALUATIONS_PERSON_LEVEL_DENIED_MEMBERSHIP_ROLES.has(ctx.membershipRole)) {
    return 'none';
  }
  if (ctx.membershipRole === 'ORG_ADMIN') return 'full';
  if (ctx.canReadCustomers) return 'full';
  if (ctx.canReadEvaluations) return 'pseudonymous';
  return 'none';
}

export function canRevealPersonIdentity(tier: EvaluationsPiiTier): boolean {
  return tier === 'full';
}

export function canAccessPersonLevel(tier: EvaluationsPiiTier): boolean {
  return tier === 'full' || tier === 'pseudonymous';
}

/**
 * Keyed, versioned, domain-separated pseudonym for an organization-scoped person
 * id. Uses HMAC-SHA-256 over `evaluations-person-<version>|orgId|personId` so:
 *  - it contains NO substring of the original id (digest hex only),
 *  - it is non-reversible without the server secret and never exposed for reverse
 *    lookup,
 *  - it is stable for the same tenant+person+version,
 *  - the same person id in a different tenant yields a different pseudonym
 *    (organizationId is part of the domain-separated input),
 *  - it is versioned.
 */
export function pseudonymizePersonRef(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly secret: string;
}): string {
  const material = `evaluations-person-${EVALUATIONS_PSEUDONYM_VERSION}|${input.organizationId}|${input.personId}`;
  const digest = createHmac('sha256', input.secret).update(material).digest('hex').slice(0, 16);
  return `person-${EVALUATIONS_PSEUDONYM_VERSION}-${digest}`;
}
