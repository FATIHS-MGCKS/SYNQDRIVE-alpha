import { PlatformPermissionKey } from '@prisma/client';

/** Allowlisted platform JWT permission strings (issuer emits DB-resolved grants only). */
export const PLATFORM_PERMISSION_JWT_VALUES = {
  MASTER_BILLING: 'master-billing',
  /** @deprecated P9 UI audit retired — enum/migration retained; no runtime consumers */
  UI_AUDIT_MASTER: 'ui-audit-master',
  UI_AUDIT_RENTAL: 'ui-audit-rental',
  UI_AUDIT_OPERATOR: 'ui-audit-operator',
} as const;

export type PlatformPermissionJwtValue =
  (typeof PLATFORM_PERMISSION_JWT_VALUES)[keyof typeof PLATFORM_PERMISSION_JWT_VALUES];

export const PLATFORM_PERMISSION_KEY_TO_JWT: Record<PlatformPermissionKey, PlatformPermissionJwtValue> =
  {
    [PlatformPermissionKey.MASTER_BILLING]: PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING,
    [PlatformPermissionKey.UI_AUDIT_MASTER]: PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_MASTER,
    [PlatformPermissionKey.UI_AUDIT_RENTAL]: PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_RENTAL,
    [PlatformPermissionKey.UI_AUDIT_OPERATOR]: PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_OPERATOR,
  };

export const PLATFORM_PERMISSION_JWT_TO_KEY: Record<
  PlatformPermissionJwtValue,
  PlatformPermissionKey
> = {
  [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING]: PlatformPermissionKey.MASTER_BILLING,
  [PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_MASTER]: PlatformPermissionKey.UI_AUDIT_MASTER,
  [PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_RENTAL]: PlatformPermissionKey.UI_AUDIT_RENTAL,
  [PLATFORM_PERMISSION_JWT_VALUES.UI_AUDIT_OPERATOR]: PlatformPermissionKey.UI_AUDIT_OPERATOR,
};