import type { RentalRuleRevision, RentalRuleRevisionScopeType } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import { extractRuleFields } from './rental-rules.mapper';
import type { RentalRuleFieldSet } from './rental-rules.types';

export function parseRevisionDocument(
  revision: RentalRuleRevision,
): NormalizedRentalRulesDocument {
  return revision.normalizedRules as unknown as NormalizedRentalRulesDocument;
}

export function revisionRulesToFieldSet(
  revision: RentalRuleRevision | null,
): Partial<RentalRuleFieldSet> | null {
  if (!revision) return null;
  return extractRuleFields(
    parseRevisionDocument(revision).rules as Parameters<typeof extractRuleFields>[0],
  );
}

export function revisionOrgIsActive(revision: RentalRuleRevision | null): boolean | null {
  if (!revision) return null;
  const value = parseRevisionDocument(revision).scopeMeta.isActive;
  return typeof value === 'boolean' ? value : null;
}

export async function findPublishedRevision(
  prisma: PrismaService,
  input: {
    organizationId: string;
    scopeType: RentalRuleRevisionScopeType;
    scopeId: string;
  },
): Promise<RentalRuleRevision | null> {
  return prisma.rentalRuleRevision.findFirst({
    where: {
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      status: 'ACTIVE',
      effectiveTo: null,
    },
    orderBy: { version: 'desc' },
  });
}

export function revisionToOrgRulesShape(
  revision: RentalRuleRevision | null,
  fallback: { isActive: boolean } | null,
) {
  if (!revision) return fallback;
  const document = parseRevisionDocument(revision);
  return {
    isActive: revisionOrgIsActive(revision) ?? fallback?.isActive ?? true,
    ...extractRuleFields(document.rules as Parameters<typeof extractRuleFields>[0]),
  };
}

export function revisionToCategoryRulesShape(revision: RentalRuleRevision | null) {
  if (!revision) return null;
  const document = parseRevisionDocument(revision);
  return extractRuleFields(document.rules as Parameters<typeof extractRuleFields>[0]);
}

export function revisionToOverrideFields(revision: RentalRuleRevision | null) {
  if (!revision) return null;
  const document = parseRevisionDocument(revision);
  return extractRuleFields(document.rules as Parameters<typeof extractRuleFields>[0]);
}
