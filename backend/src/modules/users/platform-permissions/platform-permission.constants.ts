import { PlatformPermissionKey } from '@prisma/client';

/** Allowlisted platform JWT permission strings (issuer emits DB-resolved grants only). */
export const PLATFORM_PERMISSION_JWT_VALUES = {
  MASTER_BILLING: 'master-billing',
} as const;

export type PlatformPermissionJwtValue =
  (typeof PLATFORM_PERMISSION_JWT_VALUES)[keyof typeof PLATFORM_PERMISSION_JWT_VALUES];

export const PLATFORM_PERMISSION_KEY_TO_JWT: Record<PlatformPermissionKey, PlatformPermissionJwtValue> =
  {
    [PlatformPermissionKey.MASTER_BILLING]: PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING,
  };

export const PLATFORM_PERMISSION_JWT_TO_KEY: Record<
  PlatformPermissionJwtValue,
  PlatformPermissionKey
> = {
  [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING]: PlatformPermissionKey.MASTER_BILLING,
};