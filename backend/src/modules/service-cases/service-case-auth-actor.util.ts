import type { PermissionActor } from '@shared/auth/permission.util';

export interface ServiceCaseAuthUser {
  id?: string;
  platformRole?: string;
  organizationId?: string;
}

export function resolveServiceCaseActor(user: ServiceCaseAuthUser | undefined): PermissionActor {
  return {
    id: user?.id,
    platformRole: user?.platformRole,
    organizationId: user?.organizationId,
  };
}
