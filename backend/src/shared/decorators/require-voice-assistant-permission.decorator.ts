import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { PermissionLevel } from './require-permission.decorator';
import { VOICE_ASSISTANT_PERMISSION_MODULE } from '@shared/auth/communication-permission.constants';
import {
  PERMISSION_KEY,
  type RequiredPermission,
} from './require-permission.decorator';

export const VOICE_ASSISTANT_COMPAT_CONTEXT_KEY = 'voice_assistant_compat_context';

export interface VoiceAssistantCompatRouteContext {
  voiceAdminLegacy?: boolean;
}

/**
 * Deep Voice Agent / telephony administration permission.
 * Operational conversation access uses RequireCommunicationPermission instead.
 */
export const RequireVoiceAssistantPermission = (
  level: PermissionLevel,
  compat: VoiceAssistantCompatRouteContext = { voiceAdminLegacy: true },
) =>
  applyDecorators(
    SetMetadata(PERMISSION_KEY, {
      module: VOICE_ASSISTANT_PERMISSION_MODULE,
      level,
    } satisfies RequiredPermission),
    SetMetadata(VOICE_ASSISTANT_COMPAT_CONTEXT_KEY, compat),
  );
