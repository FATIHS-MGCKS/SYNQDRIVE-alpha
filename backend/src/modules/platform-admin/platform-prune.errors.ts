import { ConflictException } from '@nestjs/common';

export const PLATFORM_PRUNE_DISABLED_CODE = 'PLATFORM_PRUNE_DISABLED';

export const PLATFORM_PRUNE_DISABLED_ACTION = 'CONTACT_PLATFORM_SECURITY_OPERATOR';

/** VO5C-P2B4-0: legacy platform-wide prune retired — unconditional fail-closed. */
export function platformPruneDisabledException(): ConflictException {
  return new ConflictException({
    code: PLATFORM_PRUNE_DISABLED_CODE,
    message:
      'Legacy platform-wide prune is disabled pending independent execution authority and recovery controls.',
    action: PLATFORM_PRUNE_DISABLED_ACTION,
  });
}
