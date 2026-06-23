import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Resolve the org scope for a billing call.
 * - MASTER_ADMIN may pass any orgId (used for support / impersonation).
 * - All other users must resolve to their JWT organizationId.
 */
export function resolveOrgScope(user: any, requestedOrgId?: string | null): string {
  if (!user) {
    throw new ForbiddenException('Authentication required');
  }
  if (user.platformRole === 'MASTER_ADMIN') {
    if (!requestedOrgId) {
      throw new NotFoundException('orgId is required for admin billing lookup');
    }
    return requestedOrgId;
  }
  const jwtOrg: string | undefined = user.organizationId;
  if (!jwtOrg) {
    throw new ForbiddenException('No organization context in token');
  }
  if (requestedOrgId && requestedOrgId !== jwtOrg) {
    throw new ForbiddenException('You do not have access to this organization');
  }
  return jwtOrg;
}
