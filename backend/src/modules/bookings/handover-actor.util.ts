import { UnauthorizedException } from '@nestjs/common';
import type { HandoverActorContext } from './booking-pickup-gate/booking-pickup-gate.types';

export function resolveHandoverActor(
  user:
    | {
        id?: string;
        displayName?: string | null;
        name?: string | null;
        platformRole?: string | null;
        membershipRole?: string | null;
      }
    | undefined,
): HandoverActorContext {
  if (!user?.id) {
    throw new UnauthorizedException('Authentication required for handover');
  }
  return {
    userId: user.id,
    displayName: user.displayName ?? user.name ?? null,
    platformRole: user.platformRole ?? null,
    membershipRole: user.membershipRole ?? null,
  };
}
