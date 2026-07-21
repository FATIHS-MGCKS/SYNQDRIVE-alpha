import {
  AccessReviewCampaignScope,
  AccessReviewCampaignStatus,
  AccessReviewDecisionType,
  AccessReviewItemStatus,
  AccessReviewResultApplicationStatus,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

export interface CreateAccessReviewCampaignInput {
  organizationId: string;
  scope: AccessReviewCampaignScope;
  reviewerUserId: string;
  dueAt: Date;
  createdByUserId: string;
  idempotencyKey: string;
}

export interface RecordAccessReviewDecisionInput {
  organizationId: string;
  itemId: string;
  reviewerUserId: string;
  decision: AccessReviewDecisionType;
  reason: string;
  idempotencyKey: string;
  modifyPayload?: {
    role?: MembershipRole;
    organizationRoleId?: string | null;
    roleLabel?: string | null;
    permissions?: MembershipPermissionsMap | null;
    stationScope?: string | null;
    stationIds?: string[] | null;
    fieldAgentAccess?: boolean;
  };
  actor?: {
    route?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface AccessReviewModifyPayload {
  role?: MembershipRole;
  organizationRoleId?: string | null;
  roleLabel?: string | null;
  permissions?: MembershipPermissionsMap | null;
  stationScope?: string | null;
  stationIds?: string[] | null;
  fieldAgentAccess?: boolean;
}
