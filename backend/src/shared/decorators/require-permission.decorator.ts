import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

export type PermissionLevel = 'read' | 'write' | 'manage';

export interface RequiredPermission {
  /**
   * The permission module key as stored in `OrganizationMembership.permissions`
   * JSON (e.g. `vendor-management`, `invoices`). Mirrors the frontend
   * PERMISSION_MODULES registry — the source of truth that ORG_ADMINs configure
   * per employee account.
   */
  module: string;
  /** `read` for GET; `write` for create/basic edits; `manage` for privileged ops. */
  level: PermissionLevel;
}

/**
 * Declarative, permission-based authorization for org-scoped routes.
 *
 * SynqDrive stores per-member capabilities as `{ [moduleKey]: { read, write } }`
 * on the membership record (configured by the ORG_ADMIN). This decorator marks a
 * handler with the capability it needs; `PermissionsGuard` enforces it without any
 * hardcoded role branching in feature code.
 *
 * Usage:
 *   @RequirePermission('vendor-management', 'write')
 */
export const RequirePermission = (module: string, level: PermissionLevel) =>
  SetMetadata(PERMISSION_KEY, { module, level } satisfies RequiredPermission);
