import { InviteEmailOutboxStatus, MembershipRole, OrganizationInviteStatus } from '@prisma/client';
import type { InviteDeliveryStatus } from '../invite-email.constants';

export function maskRecipientEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf('@');
  if (at <= 0) return '***';
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const maskedLocal =
    local.length <= 2
      ? `${local[0] ?? '*'}***`
      : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

export function buildRoleSummary(input: {
  membershipRole: MembershipRole;
  roleLabel?: string | null;
  organizationRoleName?: string | null;
}): string {
  return input.organizationRoleName ?? input.roleLabel ?? input.membershipRole;
}

export function mapOutboxToDeliveryStatus(
  status?: InviteEmailOutboxStatus | null,
): InviteDeliveryStatus {
  switch (status) {
    case InviteEmailOutboxStatus.PENDING:
      return 'QUEUED';
    case InviteEmailOutboxStatus.PROCESSING:
      return 'SENDING';
    case InviteEmailOutboxStatus.COMPLETED:
      return 'SENT';
    case InviteEmailOutboxStatus.DEAD_LETTER:
      return 'DEAD_LETTER';
    default:
      return 'QUEUED';
  }
}

export interface OrganizationInviteAdminView {
  inviteId: string;
  status: OrganizationInviteStatus;
  expiresAt: string;
  deliveryStatus: InviteDeliveryStatus;
  recipientMasked: string;
  roleSummary: string;
}

export function toInviteAdminView(input: {
  id: string;
  email: string;
  status: OrganizationInviteStatus;
  expiresAt: Date;
  membershipRole: MembershipRole;
  roleLabel?: string | null;
  organizationRoleName?: string | null;
  deliveryOutboxStatus?: InviteEmailOutboxStatus | null;
}): OrganizationInviteAdminView {
  const deliveryStatus = mapOutboxToDeliveryStatus(input.deliveryOutboxStatus);
  return {
    inviteId: input.id,
    status: input.status,
    expiresAt: input.expiresAt.toISOString(),
    deliveryStatus:
      deliveryStatus === 'QUEUED' && input.deliveryOutboxStatus == null ? 'QUEUED' : deliveryStatus,
    recipientMasked: maskRecipientEmail(input.email),
    roleSummary: buildRoleSummary(input),
  };
}
