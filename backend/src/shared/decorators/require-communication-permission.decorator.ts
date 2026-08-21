import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { PermissionLevel } from './require-permission.decorator';
import { COMMUNICATION_PERMISSION_MODULE } from '@shared/auth/communication-permission.constants';
import {
  PERMISSION_KEY,
  type RequiredPermission,
} from './require-permission.decorator';

export const COMMUNICATION_COMPAT_CONTEXT_KEY = 'communication_compat_context';

export interface CommunicationCompatRouteContext {
  voiceOperationalLegacy?: boolean;
}

/**
 * Declarative Communication Center permission for external operational comms.
 * Enforced by PermissionsGuard with centralized legacy compatibility.
 */
export const RequireCommunicationPermission = (
  level: PermissionLevel,
  compat: CommunicationCompatRouteContext = {},
) =>
  applyDecorators(
    SetMetadata(PERMISSION_KEY, {
      module: COMMUNICATION_PERMISSION_MODULE,
      level,
    } satisfies RequiredPermission),
    SetMetadata(COMMUNICATION_COMPAT_CONTEXT_KEY, compat),
  );
