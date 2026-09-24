import type { BatteryLongitudinalProfileRevision } from '@prisma/client';
import {
  canonicalFeatureInputUtf8,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import { assertValidProfileFingerprintHex } from './longitudinal-profile-fingerprint';
import { buildLongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import { revisionMetadataMirrorsPersistenceInput } from './longitudinal-profile-materialization.metadata-mirror';
import type { D4ReasonCode } from './longitudinal-integrity-inspection.types';
import type { LongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import { parseLongitudinalScientificProfileProjectionV1 } from './longitudinal-scientific-profile.parser';

export type D4RevisionSelfIntegrityCheckOutcome =
  | {
      status: 'OK';
      projection: LongitudinalScientificProfileProjectionV1;
      selfIntegrityReasons: [];
    }
  | {
      status: 'PARSE_FAILED';
      reasons: D4ReasonCode[];
    }
  | {
      status: 'SELF_INTEGRITY_FAILED';
      projection: LongitudinalScientificProfileProjectionV1;
      reasons: D4ReasonCode[];
    };

export function evaluateMaterializedRevisionSelfIntegrity(
  revision: BatteryLongitudinalProfileRevision,
): D4RevisionSelfIntegrityCheckOutcome {
  const parsed = parseLongitudinalScientificProfileProjectionV1(
    revision.scientificProfileJson,
  );
  if (parsed.status === 'FAILED') {
    return { status: 'PARSE_FAILED', reasons: [parsed.reason] };
  }

  const reasons: D4ReasonCode[] = [];
  const projection = parsed.projection;

  try {
    assertValidProfileFingerprintHex(revision.canonicalProfileFingerprint);
  } catch {
    reasons.push('PROFILE_FINGERPRINT_MISMATCH');
  }

  const rawCanonicalUtf8 = canonicalFeatureInputUtf8(revision.scientificProfileJson);
  const rawRecomputed = sha256HexLowercaseUtf8(rawCanonicalUtf8);
  if (rawRecomputed !== revision.canonicalProfileFingerprint) {
    reasons.push('PROFILE_FINGERPRINT_MISMATCH');
  }

  const persistenceInput = buildLongitudinalProfileMaterializationPersistenceInput({
    scientificProjection: projection,
    canonicalScientificUtf8: rawCanonicalUtf8,
    canonicalProfileFingerprint: revision.canonicalProfileFingerprint,
  });

  if (!revisionMetadataMirrorsPersistenceInput(revision, persistenceInput)) {
    reasons.push('PROFILE_METADATA_MIRROR_MISMATCH');
  }

  if (reasons.length > 0) {
    return { status: 'SELF_INTEGRITY_FAILED', projection, reasons };
  }

  return { status: 'OK', projection, selfIntegrityReasons: [] };
}
