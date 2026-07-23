import type { Prisma, PrismaClient } from '@prisma/client';
import { buildRentalRuleRevisionSnapshot } from './rental-rules-revision.util';

const BACKFILL_CHANGE_REASON = 'Initial revision backfill (Prompt 24)';

export interface RentalRuleRevisionBackfillResult {
  organization: number;
  category: number;
  vehicle: number;
  skipped: number;
}

type RevisionDelegate = Pick<PrismaClient['rentalRuleRevision'], 'findFirst' | 'create'>;

export async function backfillRentalRuleRevisions(
  prisma: Pick<
    PrismaClient,
    | 'organizationRentalRules'
    | 'rentalVehicleCategory'
    | 'vehicleRentalRequirementOverride'
    | 'rentalRuleRevision'
  >,
): Promise<RentalRuleRevisionBackfillResult> {
  const result: RentalRuleRevisionBackfillResult = {
    organization: 0,
    category: 0,
    vehicle: 0,
    skipped: 0,
  };

  const orgRows = await prisma.organizationRentalRules.findMany();
  for (const row of orgRows) {
    const created = await upsertInitialRevision(prisma.rentalRuleRevision, {
      organizationId: row.organizationId,
      scopeType: 'ORGANIZATION',
      scopeId: row.organizationId,
      version: row.version,
      row: { ...row, isActive: row.isActive },
      effectiveFrom: row.createdAt,
      publishedAt: row.updatedAt,
    });
    if (created) result.organization += 1;
    else result.skipped += 1;
  }

  const categories = await prisma.rentalVehicleCategory.findMany();
  for (const row of categories) {
    const created = await upsertInitialRevision(prisma.rentalRuleRevision, {
      organizationId: row.organizationId,
      scopeType: 'CATEGORY',
      scopeId: row.id,
      version: row.version,
      row: { ...row },
      effectiveFrom: row.statusChangedAt ?? row.createdAt,
      publishedAt: row.updatedAt,
    });
    if (created) result.category += 1;
    else result.skipped += 1;
  }

  const overrides = await prisma.vehicleRentalRequirementOverride.findMany();
  for (const row of overrides) {
    const created = await upsertInitialRevision(prisma.rentalRuleRevision, {
      organizationId: row.organizationId,
      scopeType: 'VEHICLE',
      scopeId: row.vehicleId,
      version: row.version,
      row: { ...row },
      effectiveFrom: row.createdAt,
      publishedAt: row.updatedAt,
    });
    if (created) result.vehicle += 1;
    else result.skipped += 1;
  }

  return result;
}

async function upsertInitialRevision(
  delegate: RevisionDelegate,
  input: {
    organizationId: string;
    scopeType: 'ORGANIZATION' | 'CATEGORY' | 'VEHICLE';
    scopeId: string;
    version: number;
    row: Record<string, unknown>;
    effectiveFrom: Date;
    publishedAt: Date;
  },
): Promise<boolean> {
  const existing = await delegate.findFirst({
    where: {
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      version: input.version,
    },
    select: { id: true },
  });
  if (existing) return false;

  const { normalizedRules, rulesHash } = buildRentalRuleRevisionSnapshot({
    scopeType: input.scopeType,
    row: input.row,
  });

  const data: Prisma.RentalRuleRevisionCreateInput = {
    organization: { connect: { id: input.organizationId } },
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    version: input.version,
    status: 'ACTIVE',
    normalizedRules: normalizedRules as unknown as Prisma.InputJsonValue,
    rulesHash,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    changeReason: BACKFILL_CHANGE_REASON,
    publishedAt: input.publishedAt,
    lockVersion: 1,
  };

  await delegate.create({ data });
  return true;
}
