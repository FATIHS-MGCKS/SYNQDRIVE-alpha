import type { PermissionActor } from '@shared/auth/permission.util';

export interface TaskAuthUser {
  id?: string;
  platformRole?: string;
  organizationId?: string;
}

export function resolveTaskActor(user: TaskAuthUser | undefined): PermissionActor {
  return {
    id: user?.id,
    platformRole: user?.platformRole,
    organizationId: user?.organizationId,
  };
}
