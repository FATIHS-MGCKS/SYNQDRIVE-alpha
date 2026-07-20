import { SetMetadata } from '@nestjs/common';
import type { VoiceEntitlementCapability } from './voice-entitlement.types';

export const VOICE_ENTITLEMENT_KEY = 'voice_entitlement_capabilities';

/** Require one or more voice entitlement capabilities for the route handler. */
export const RequireVoiceEntitlement = (...capabilities: VoiceEntitlementCapability[]) =>
  SetMetadata(VOICE_ENTITLEMENT_KEY, capabilities);
