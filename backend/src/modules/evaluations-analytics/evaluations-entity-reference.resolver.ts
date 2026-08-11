import { Prisma } from '@prisma/client';
import type {
  EvaluationsEntityType,
  EvaluationsReferenceOwnerType,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';

/**
 * Central tenant-aware resolver for analytics entity references. It answers a
 * single question per lookup: does this id name an object that exists AND
 * belongs to the given organization, for the expected entity/owner type?
 *
 * Only minimal `{ id }` metadata is selected — never PII — so validation can
 * never become a PII snapshot source. Every lookup is organization-scoped
 * (`WHERE id = ? AND organization_id = ?`); an out-of-tenant or missing target
 * simply does not match, which the write gate turns into a fail-closed rejection
 * without leaking existence.
 */

/** Client usable both standalone and inside a transaction. */
export type EvaluationsResolverClient = Prisma.TransactionClient;

type OrgScopedLookup = (
  client: EvaluationsResolverClient,
  organizationId: string,
  id: string,
) => Promise<boolean>;

async function exists(promise: Promise<{ id: string } | null>): Promise<boolean> {
  return (await promise) !== null;
}

/**
 * Target entity types E2 can persist a reference to, each mapped to an
 * organization-scoped existence lookup. Types absent here (e.g. DRIVER) have no
 * canonical organization-scoped entity and are rejected fail-closed by the write
 * gate rather than persisted unvalidated.
 */
const TARGET_LOOKUPS: Partial<Record<EvaluationsEntityType, OrgScopedLookup>> = {
  VEHICLE: (c, o, id) =>
    exists(c.vehicle.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  BOOKING: (c, o, id) =>
    exists(c.booking.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  CUSTOMER: (c, o, id) =>
    exists(c.customer.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  STATION: (c, o, id) =>
    exists(c.station.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  INVOICE: (c, o, id) =>
    exists(c.orgInvoice.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  TASK: (c, o, id) =>
    exists(c.orgTask.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  SERVICE_CASE: (c, o, id) =>
    exists(c.serviceCase.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  DAMAGE: (c, o, id) =>
    exists(c.vehicleDamage.findFirst({ where: { id, organizationId: o }, select: { id: true } })),
  DOCUMENT: (c, o, id) =>
    exists(
      c.generatedDocument.findFirst({ where: { id, organizationId: o }, select: { id: true } }),
    ),
  PAYMENT: (c, o, id) =>
    exists(
      c.paymentTransaction.findFirst({ where: { id, organizationId: o }, select: { id: true } }),
    ),
  // USER is global; organization ownership is an ACTIVE membership in the org.
  USER: (c, o, id) =>
    exists(
      c.organizationMembership.findFirst({
        where: { userId: id, organizationId: o, status: 'ACTIVE' },
        select: { id: true },
      }),
    ),
};

/** Entity types E2 can persist a reference to (tenant-validated). */
export const EVALUATIONS_PERSISTABLE_ENTITY_TYPES = Object.keys(
  TARGET_LOOKUPS,
) as EvaluationsEntityType[];

type OwnerLookup = OrgScopedLookup;

/**
 * Owner types E2 can persist, mapped to an organization-scoped existence
 * lookup. `INSIGHT` owners are DashboardInsight rows. `ANALYTICS_GROUP` has no
 * tenant-owned backing store in E2 and is rejected fail-closed rather than
 * persisted with an unverifiable owner.
 */
const OWNER_LOOKUPS: Partial<Record<EvaluationsReferenceOwnerType, OwnerLookup>> = {
  INSIGHT: (c, o, id) =>
    exists(
      c.dashboardInsight.findFirst({ where: { id, organizationId: o }, select: { id: true } }),
    ),
};

export const EVALUATIONS_PERSISTABLE_OWNER_TYPES = Object.keys(
  OWNER_LOOKUPS,
) as EvaluationsReferenceOwnerType[];

export function isPersistableEvaluationsEntityType(
  entityType: EvaluationsEntityType,
): boolean {
  return entityType in TARGET_LOOKUPS;
}

export function isPersistableEvaluationsOwnerType(
  ownerType: EvaluationsReferenceOwnerType,
): boolean {
  return ownerType in OWNER_LOOKUPS;
}

export interface EvaluationsTargetResolution {
  readonly persistable: boolean;
  readonly belongsToOrganization: boolean;
}

export async function resolveEvaluationsTargetInOrganization(
  client: EvaluationsResolverClient,
  organizationId: string,
  entityType: EvaluationsEntityType,
  entityId: string,
): Promise<EvaluationsTargetResolution> {
  const lookup = TARGET_LOOKUPS[entityType];
  if (!lookup) return { persistable: false, belongsToOrganization: false };
  return { persistable: true, belongsToOrganization: await lookup(client, organizationId, entityId) };
}

export async function resolveEvaluationsOwnerInOrganization(
  client: EvaluationsResolverClient,
  organizationId: string,
  ownerType: EvaluationsReferenceOwnerType,
  ownerId: string,
): Promise<EvaluationsTargetResolution> {
  const lookup = OWNER_LOOKUPS[ownerType];
  if (!lookup) return { persistable: false, belongsToOrganization: false };
  return { persistable: true, belongsToOrganization: await lookup(client, organizationId, ownerId) };
}
