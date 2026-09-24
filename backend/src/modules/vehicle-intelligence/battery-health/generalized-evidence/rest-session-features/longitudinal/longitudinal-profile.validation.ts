import { REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION } from './longitudinal-input.constants';
import { LONGITUDINAL_PROFILE_D1_CONTRACT_EXPECTED } from './longitudinal-profile.constants';
import type { LongitudinalProfileAssemblyRejectReason } from './longitudinal-profile.types';
import type {
  LongitudinalInputReadResultV1,
  LongitudinalInputSessionInventoryItem,
} from './longitudinal-input.types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validateLongitudinalProfileAssemblyInput(
  inventory: LongitudinalInputReadResultV1,
): LongitudinalProfileAssemblyRejectReason | null {
  if (
    inventory.longitudinalInputContractVersion !== LONGITUDINAL_PROFILE_D1_CONTRACT_EXPECTED ||
    inventory.longitudinalInputContractVersion !== REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION
  ) {
    return 'UNSUPPORTED_D1_CONTRACT';
  }

  if (!isNonEmptyString(inventory.organizationId) || !isNonEmptyString(inventory.vehicleId)) {
    return 'IDENTITY_MISMATCH';
  }

  if (
    !Number.isInteger(inventory.requestedSessionLimit) ||
    !Number.isInteger(inventory.appliedSessionLimit) ||
    inventory.requestedSessionLimit < 1 ||
    inventory.appliedSessionLimit < 1 ||
    inventory.appliedSessionLimit > 100 ||
    inventory.sessions.length > inventory.appliedSessionLimit
  ) {
    return 'INVALID_WINDOW_METADATA';
  }

  const seen = new Set<string>();
  for (const session of inventory.sessions) {
    if (
      session.organizationId !== inventory.organizationId ||
      session.vehicleId !== inventory.vehicleId
    ) {
      return 'IDENTITY_MISMATCH';
    }
    if (seen.has(session.restSessionId)) {
      return 'DUPLICATE_REST_SESSION';
    }
    seen.add(session.restSessionId);

    const mode = session.quality.inclusionMode;
    if (mode === 'DEFAULT') {
      const err = validateIncludedLikeItem(session, 'INCONSISTENT_DEFAULT_ITEM');
      if (err) return err;
    } else if (mode === 'PROVISIONAL') {
      const err = validateIncludedLikeItem(session, 'INCONSISTENT_PROVISIONAL_ITEM');
      if (err) return err;
    }
  }

  return null;
}

function validateIncludedLikeItem(
  session: LongitudinalInputSessionInventoryItem,
  reason:
    | 'INCONSISTENT_DEFAULT_ITEM'
    | 'INCONSISTENT_PROVISIONAL_ITEM',
): LongitudinalProfileAssemblyRejectReason | null {
  if (
    !session.canonical ||
    !session.version ||
    !session.features ||
    !session.snapshot
  ) {
    return reason;
  }
  if (
    session.version.inputContractResolution !== 'RESOLVED' ||
    session.version.inputContractVersion === null
  ) {
    return reason;
  }
  return null;
}
