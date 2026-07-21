/**
 * Explicit organization session switch policy (Prompt 8/22).
 */

import { MembershipStatus } from '@prisma/client';
import type { LoginMembershipCandidate } from './refresh-session-binding.policy';

export type OrganizationSwitchFailureCode =
  | 'ORGANIZATION_NOT_ACCESSIBLE'
  | 'MEMBERSHIP_INACTIVE'
  | 'MEMBERSHIP_REMOVED'
  | 'ALREADY_ACTIVE_ORGANIZATION'
  | 'CROSS_TENANT_BINDING';

export type OrganizationSwitchResolution =
  | { ok: true; membership: LoginMembershipCandidate }
  | { ok: false; code: OrganizationSwitchFailureCode; message: string };

export type OrganizationOption = {
  organizationId: string;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  membershipId: string;
  role: string;
};

export function mapMembershipsToOrganizationOptions(
  memberships: LoginMembershipCandidate[],
): OrganizationOption[] {
  return memberships
    .filter((m) => m.status === MembershipStatus.ACTIVE)
    .map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization?.companyName ?? null,
      organizationLogoUrl: m.organization?.logoUrl ?? null,
      membershipId: m.id,
      role: m.role,
    }));
}

/**
 * UI hint only — never used to mint tokens without explicit user confirmation.
 */
export function resolveSuggestedOrganizationId(
  activeMemberships: LoginMembershipCandidate[],
  lastSelectedOrganizationId?: string | null,
): string | null {
  if (activeMemberships.length === 0) return null;
  if (activeMemberships.length === 1) return activeMemberships[0]!.organizationId;
  if (!lastSelectedOrganizationId) return null;
  const match = activeMemberships.find(
    (m) => m.organizationId === lastSelectedOrganizationId,
  );
  return match ? match.organizationId : null;
}

export function validateOrganizationSwitchTarget(
  targetOrganizationId: string,
  currentOrganizationId: string | null | undefined,
  membership: LoginMembershipCandidate | null,
): OrganizationSwitchResolution {
  if (currentOrganizationId && currentOrganizationId === targetOrganizationId) {
    return {
      ok: false,
      code: 'ALREADY_ACTIVE_ORGANIZATION',
      message: 'You are already signed in to this organization',
    };
  }

  if (!membership) {
    return {
      ok: false,
      code: 'ORGANIZATION_NOT_ACCESSIBLE',
      message: 'You do not have access to the requested organization',
    };
  }

  if (membership.organizationId !== targetOrganizationId) {
    return {
      ok: false,
      code: 'CROSS_TENANT_BINDING',
      message: 'Organization does not match membership',
    };
  }

  if (membership.status === MembershipStatus.REMOVED) {
    return {
      ok: false,
      code: 'MEMBERSHIP_REMOVED',
      message: 'Organization membership has been removed',
    };
  }

  if (membership.status !== MembershipStatus.ACTIVE) {
    return {
      ok: false,
      code: 'MEMBERSHIP_INACTIVE',
      message: 'Organization membership is not active',
    };
  }

  return { ok: true, membership };
}
