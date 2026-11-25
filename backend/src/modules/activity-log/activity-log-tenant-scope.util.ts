import { Prisma } from '@prisma/client';
import { MASTER_ADMIN_AUDIT_DOMAIN } from './master-admin-audit.contract';

/** Tenant-facing reads must not hide legacy rows with null meta_json. */
export function activityLogTenantScopeExcludesMasterAdmin(): Prisma.ActivityLogWhereInput {
  return {
    OR: [
      { metaJson: { equals: Prisma.DbNull } },
      {
        NOT: {
          metaJson: {
            path: ['auditDomain'],
            equals: MASTER_ADMIN_AUDIT_DOMAIN,
          },
        },
      },
    ],
  };
}