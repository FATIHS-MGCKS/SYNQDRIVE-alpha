import type { RentalRuleRevisionScopeType, RentalRuleRevisionStatus } from '@prisma/client';
import type { RentalRuleFieldKey, RentalRuleFieldSet } from './rental-rules.types';

export type { RentalRuleRevisionScopeType, RentalRuleRevisionStatus };

export interface NormalizedRentalRulesDocument {
  rules: Record<RentalRuleFieldKey, RentalRuleFieldSet[RentalRuleFieldKey]>;
  scopeMeta: Record<string, string | number | boolean | null>;
}

export interface RentalRuleRevisionRecordInput {
  organizationId: string;
  scopeType: RentalRuleRevisionScopeType;
  scopeId: string;
  version: number;
  status: RentalRuleRevisionStatus;
  normalizedRules: NormalizedRentalRulesDocument;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  createdBy?: string | null;
  publishedBy?: string | null;
  publishedAt?: Date | null;
  changeReason?: string | null;
  supersedesRevisionId?: string | null;
  lockVersion?: number;
}
