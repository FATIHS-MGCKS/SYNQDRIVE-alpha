import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { MembershipStatus } from '@prisma/client';
import {
  mapMembershipsToOrganizationOptions,
  resolveSuggestedOrganizationId,
} from '@modules/users/policies/organization-switch.policy';
import type { LoginMembershipCandidate } from '@modules/users/policies/refresh-session-binding.policy';

@Injectable()
export class AuthSessionContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSessionMembership(
    userId: string,
    organizationId: string | null | undefined,
    membershipId?: string | null,
  ): Promise<LoginMembershipCandidate | null> {
    if (membershipId) {
      const byId = await this.prisma.organizationMembership.findFirst({
        where: { id: membershipId, userId, status: MembershipStatus.ACTIVE },
        include: { organization: true },
      });
      if (byId) return this.toCandidate(byId);
    }

    if (organizationId) {
      const byOrg = await this.prisma.organizationMembership.findFirst({
        where: {
          userId,
          organizationId,
          status: MembershipStatus.ACTIVE,
        },
        include: { organization: true },
      });
      if (byOrg) return this.toCandidate(byOrg);
    }

    return null;
  }

  async listActiveMemberships(userId: string): Promise<LoginMembershipCandidate[]> {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toCandidate(row));
  }

  buildOrganizationSelectionPayload(
    memberships: LoginMembershipCandidate[],
    lastSelectedOrganizationId: string | null,
  ) {
    return {
      requiresOrganizationSelection: true as const,
      organizations: mapMembershipsToOrganizationOptions(memberships),
      suggestedOrganizationId: resolveSuggestedOrganizationId(
        memberships,
        lastSelectedOrganizationId,
      ),
    };
  }

  buildUserResponse(
    user: {
      id: string;
      email: string;
      name: string | null;
      platformRole: string;
      mustChangePassword?: boolean;
    },
    membership: LoginMembershipCandidate | null,
  ) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      mustChangePassword: user.mustChangePassword ?? false,
      membershipRole: membership?.role ?? null,
      organizationId: membership?.organizationId ?? null,
      organizationName: membership?.organization?.companyName ?? null,
      organizationLogoUrl: membership?.organization?.logoUrl ?? null,
      permissions:
        (membership?.permissions as Record<
          string,
          { read: boolean; write: boolean; manage?: boolean }
        >) ?? null,
      membershipId: membership?.id ?? null,
    };
  }

  private toCandidate(row: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
    organizationRoleId: string | null;
    status: MembershipStatus;
    membershipVersion: number;
    permissions: unknown;
    organization: { companyName: string | null; logoUrl: string | null } | null;
  }): LoginMembershipCandidate {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role,
      status: row.status,
      membershipVersion: row.membershipVersion,
      permissions: row.permissions,
      organizationRoleId: row.organizationRoleId,
      organization: row.organization,
    };
  }
}
