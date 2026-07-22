import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PickupGateRequirement } from './booking-pickup-gate.types';

export class PickupGateBlockedException extends ConflictException {
  constructor(payload: {
    code: string;
    message: string;
    missingRequirements: PickupGateRequirement[];
    hardBlocks: PickupGateRequirement[];
    softBlocks: PickupGateRequirement[];
    overrideAllowed: boolean;
  }) {
    super({
      code: payload.code,
      message: payload.message,
      missingRequirements: payload.missingRequirements,
      hardBlocks: payload.hardBlocks,
      softBlocks: payload.softBlocks,
      overrideAllowed: payload.overrideAllowed,
    });
  }
}

export class PickupGateOverrideDeniedException extends ForbiddenException {
  constructor(message = 'Pickup gate override permission required') {
    super({
      code: 'PICKUP_GATE_OVERRIDE_DENIED',
      message,
    });
  }
}
