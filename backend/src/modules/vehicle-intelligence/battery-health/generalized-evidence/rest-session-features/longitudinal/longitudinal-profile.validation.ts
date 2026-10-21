import {
  LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
  REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION,
} from './longitudinal-input.constants';
import type { LongitudinalInputExclusionReason } from './longitudinal-input.types';
import { LONGITUDINAL_PROFILE_D1_CONTRACT_EXPECTED } from './longitudinal-profile.constants';
import type {
  LongitudinalProfileAssemblyInput,
  LongitudinalProfileAssemblyRejectReason,
} from './longitudinal-profile.types';
import type {
  LongitudinalInputReadResultV1,
  LongitudinalInputSessionInventoryItem,
} from './longitudinal-input.types';

const RECOGNIZED_INCLUSION_MODES = ['DEFAULT', 'PROVISIONAL', 'EXCLUDED'] as const;

const RECOGNIZED_EXCLUSION_REASONS: LongitudinalInputExclusionReason[] = [
  'NO_CANONICAL_ROW',
  'SESSION_INVALIDATED',
  'SESSION_TRUST_INVALIDATED',
  'INPUT_CONTRACT_VERSION_UNRESOLVED',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isCanonicalUtcIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return new Date(value).toISOString() === value;
}

function isRecognizedInclusionMode(
  mode: unknown,
): mode is (typeof RECOGNIZED_INCLUSION_MODES)[number] {
  return (
    typeof mode === 'string' &&
    (RECOGNIZED_INCLUSION_MODES as readonly string[]).includes(mode)
  );
}

function validateExclusionReasons(
  reasons: unknown,
): LongitudinalProfileAssemblyRejectReason | null {
  if (!Array.isArray(reasons)) {
    return 'INVALID_EXCLUSION_REASON';
  }
  if (reasons.length === 0) {
    return null;
  }
  for (const reason of reasons) {
    if (
      typeof reason !== 'string' ||
      !(RECOGNIZED_EXCLUSION_REASONS as readonly string[]).includes(reason)
    ) {
      return 'INVALID_EXCLUSION_REASON';
    }
  }
  return null;
}

export function validateLongitudinalProfileGeneratedAt(
  profileGeneratedAt: string,
): LongitudinalProfileAssemblyRejectReason | null {
  if (!isCanonicalUtcIsoTimestamp(profileGeneratedAt)) {
    return 'INVALID_PROFILE_GENERATED_AT';
  }
  return null;
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

  const max = LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS;
  if (
    inventory.dbSafetyMaxSessions !== max ||
    !Number.isInteger(inventory.requestedSessionLimit) ||
    !Number.isInteger(inventory.appliedSessionLimit) ||
    inventory.requestedSessionLimit < 1 ||
    inventory.appliedSessionLimit < 1 ||
    inventory.requestedSessionLimit > max ||
    inventory.appliedSessionLimit > max ||
    inventory.requestedSessionLimit !== inventory.appliedSessionLimit ||
    inventory.sessions.length > inventory.appliedSessionLimit
  ) {
    return 'INVALID_WINDOW_METADATA';
  }

  const seen = new Set<string>();
  for (const session of inventory.sessions) {
    if (!isNonEmptyString(session.restSessionId)) {
      return 'INVALID_SESSION_IDENTITY';
    }
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

    if (!isCanonicalUtcIsoTimestamp(session.session.anchorAt)) {
      return 'INVALID_TEMPORAL_METADATA';
    }

    if (session.quality.perSessionInspectionStatus !== 'NOT_EVALUATED') {
      return 'INVALID_D1_INSPECTION_STATUS';
    }

    const exclusionReasonErr = validateExclusionReasons(session.quality.exclusionReasons);
    if (exclusionReasonErr) {
      return exclusionReasonErr;
    }

    const mode = session.quality.inclusionMode;
    if (!isRecognizedInclusionMode(mode)) {
      return 'INVALID_INCLUSION_MODE';
    }

    if (mode === 'DEFAULT') {
      const err = validateIncludedLikeItem(session, 'INCONSISTENT_DEFAULT_ITEM');
      if (err) return err;
      if (session.quality.exclusionReasons.length > 0) {
        return 'INCONSISTENT_DEFAULT_ITEM';
      }
    } else if (mode === 'PROVISIONAL') {
      const err = validateIncludedLikeItem(session, 'INCONSISTENT_PROVISIONAL_ITEM');
      if (err) return err;
      if (session.quality.exclusionReasons.length > 0) {
        return 'INCONSISTENT_PROVISIONAL_ITEM';
      }
    } else if (mode === 'EXCLUDED') {
      if (session.quality.exclusionReasons.length === 0) {
        return 'INCONSISTENT_EXCLUDED_ITEM';
      }
    }
  }

  return null;
}

export function validateLongitudinalProfileAssembly(
  input: LongitudinalProfileAssemblyInput,
): LongitudinalProfileAssemblyRejectReason | null {
  const generatedAtErr = validateLongitudinalProfileGeneratedAt(input.profileGeneratedAt);
  if (generatedAtErr) {
    return generatedAtErr;
  }
  return validateLongitudinalProfileAssemblyInput(input.inventory);
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
