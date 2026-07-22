import { createHash } from 'crypto';
import { IamDataCategory, IamRetentionStrategy } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IAM_DATA_CATEGORY_DEFINITIONS } from './iam-data-retention.contract';

export interface ResolvedIamRetentionPolicy {
  category: IamDataCategory;
  retentionDays: number;
  strategy: IamRetentionStrategy;
  enabled: boolean;
  source: 'default' | 'override';
  requiresOrgApproval: boolean;
}

export function pseudonymizeValue(value: string | null | undefined, salt: string): string | null {
  if (!value || !value.trim()) return null;
  const digest = createHash('sha256')
    .update(`${salt}:${value.trim()}`)
    .digest('hex');
  return `psn_${digest.slice(0, 24)}`;
}

export async function resolveIamRetentionPolicy(
  prisma: PrismaService,
  organizationId: string,
  category: IamDataCategory,
): Promise<ResolvedIamRetentionPolicy> {
  const policies = await resolveRetentionPolicies(prisma, organizationId);
  const policy = policies.find((p) => p.category === category);
  if (!policy) {
    const def = IAM_DATA_CATEGORY_DEFINITIONS[category];
    return {
      category,
      retentionDays: def.defaultRetentionDays,
      strategy: def.defaultStrategy,
      enabled: def.defaultRetentionDays > 0 || def.immediateCleanup,
      source: 'default',
      requiresOrgApproval: def.requiresOrgApproval,
    };
  }
  return policy;
}

export async function resolveRetentionPolicies(
  prisma: PrismaService,
  organizationId: string | null,
): Promise<ResolvedIamRetentionPolicy[]> {
  const overrides = organizationId
    ? await prisma.iamRetentionPolicyOverride.findMany({
        where: { organizationId, enabled: true },
      })
    : [];

  const overrideMap = new Map(overrides.map((o) => [o.category, o]));

  return Object.values(IAM_DATA_CATEGORY_DEFINITIONS).map((def) => {
    const override = overrideMap.get(def.category);
    if (override) {
      return {
        category: def.category,
        retentionDays: override.retentionDays,
        strategy: override.strategy,
        enabled: true,
        source: 'override' as const,
        requiresOrgApproval: def.requiresOrgApproval,
      };
    }
    return {
      category: def.category,
      retentionDays: def.defaultRetentionDays,
      strategy: def.defaultStrategy,
      enabled: def.defaultRetentionDays > 0 || def.immediateCleanup,
      source: 'default' as const,
      requiresOrgApproval: def.requiresOrgApproval,
    };
  });
}

export function retentionCutoff(days: number): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}
