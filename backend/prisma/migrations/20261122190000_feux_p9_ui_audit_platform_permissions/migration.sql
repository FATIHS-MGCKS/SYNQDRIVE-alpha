-- FEUX P9: least-privilege UI audit platform permission keys (provisioned in P9C only).
ALTER TYPE "PlatformPermissionKey" ADD VALUE IF NOT EXISTS 'ui-audit-master';
ALTER TYPE "PlatformPermissionKey" ADD VALUE IF NOT EXISTS 'ui-audit-rental';
ALTER TYPE "PlatformPermissionKey" ADD VALUE IF NOT EXISTS 'ui-audit-operator';