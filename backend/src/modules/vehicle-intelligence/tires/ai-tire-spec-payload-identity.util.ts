import type { AiTireSpec } from './tire-health.config';
import {
  buildJobAxleIdentityTuple,
  buildSetupAxleIdentityTuples,
  normalizeLoadSpeedIndex,
  normalizeTireSizeForCompare,
  type TireAxleIdentityTuple,
  type TireSetupIdentitySnapshot,
} from './ai-tire-spec-job-binding.util';
import { resolveSpecTireSizeRaw } from './ai-tire-spec-setup-consistency.util';

export interface AiTireSpecPayloadIdentity {
  tireSize: string;
  loadIndex: string;
  speedIndex: string;
}

export interface AiTireSpecApplyGenerationBinding {
  tireSetupId: string;
  setupUpdatedAt: string;
  requestTireSize: string;
  requestLoadIndex: string;
  requestSpeedIndex: string;
}

export type PayloadIdentityValidationResult =
  | { ok: true; matchedAxleCount: 1 }
  | { ok: false; code: string; message: string };

function tuplesEqual(a: TireAxleIdentityTuple, b: TireAxleIdentityTuple): boolean {
  return (
    a.dimension === b.dimension &&
    a.loadIndex === b.loadIndex &&
    a.speedIndex === b.speedIndex
  );
}

/** Identity extracted from normalized AI spec payload (never from client-only fields). */
export function extractPayloadIdentityFromSpec(
  spec: AiTireSpec | null,
): AiTireSpecPayloadIdentity | null {
  if (!spec) return null;
  const tireSize = resolveSpecTireSizeRaw(spec);
  const loadIndex = spec.loadIndex?.trim();
  const speedIndex = spec.speedIndex?.trim();
  if (!tireSize || !loadIndex || !speedIndex) return null;
  const tuple = buildJobAxleIdentityTuple({ tireSize, loadIndex, speedIndex });
  if (!tuple) return null;
  return { tireSize, loadIndex, speedIndex };
}

export function countMatchingSetupAxlesForIdentity(
  identity: AiTireSpecPayloadIdentity,
  setup: Pick<
    TireSetupIdentitySnapshot,
    | 'frontDimension'
    | 'rearDimension'
    | 'loadIndexFront'
    | 'loadIndexRear'
    | 'speedIndexFront'
    | 'speedIndexRear'
  >,
): number {
  return countPhysicalAxlesMatchingIdentity(identity, setup);
}

/** Count front and rear axles separately — identical staggered sizes must not bind to both. */
export function countPhysicalAxlesMatchingIdentity(
  identity: AiTireSpecPayloadIdentity,
  setup: Pick<
    TireSetupIdentitySnapshot,
    | 'frontDimension'
    | 'rearDimension'
    | 'loadIndexFront'
    | 'loadIndexRear'
    | 'speedIndexFront'
    | 'speedIndexRear'
  >,
): number {
  const jobTuple = buildJobAxleIdentityTuple(identity);
  if (!jobTuple) return 0;

  let matches = 0;
  const frontDim = normalizeTireSizeForCompare(setup.frontDimension);
  const frontLoad = normalizeLoadSpeedIndex(setup.loadIndexFront);
  const frontSpeed = normalizeLoadSpeedIndex(setup.speedIndexFront);
  if (frontDim && frontLoad && frontSpeed) {
    if (tuplesEqual({ dimension: frontDim, loadIndex: frontLoad, speedIndex: frontSpeed }, jobTuple)) {
      matches += 1;
    }
  }

  const rearDim = normalizeTireSizeForCompare(setup.rearDimension);
  const rearLoad = normalizeLoadSpeedIndex(setup.loadIndexRear);
  const rearSpeed = normalizeLoadSpeedIndex(setup.speedIndexRear);
  if (rearDim && rearLoad && rearSpeed) {
    if (tuplesEqual({ dimension: rearDim, loadIndex: rearLoad, speedIndex: rearSpeed }, jobTuple)) {
      matches += 1;
    }
  }

  return matches;
}

/**
 * Validates AI spec payload identity against server setup axles.
 * Rejects ambiguous (0 or >1 matching axle tuples on staggered setups).
 */
export function validatePayloadIdentityAgainstSetup(
  spec: AiTireSpec,
  setup: TireSetupIdentitySnapshot,
): PayloadIdentityValidationResult {
  const identity = extractPayloadIdentityFromSpec(spec);
  if (!identity) {
    return {
      ok: false,
      code: 'INCOMPLETE_SPEC_IDENTITY',
      message:
        'AI tire spec payload lacks complete size, load index, and speed index identity',
    };
  }

  const setupTuples = buildSetupAxleIdentityTuples(setup);
  if (setupTuples.length === 0) {
    return {
      ok: false,
      code: 'INSUFFICIENT_SETUP_IDENTITY',
      message: 'Tire setup lacks complete axle identity (dimension, load, and speed per axle)',
    };
  }

  const matchCount = countPhysicalAxlesMatchingIdentity(identity, setup);
  if (matchCount === 0) {
    return {
      ok: false,
      code: 'PAYLOAD_AXLE_IDENTITY_MISMATCH',
      message: 'AI spec identity does not match any complete axle on the tire setup',
    };
  }
  if (matchCount > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_AXLE_BINDING',
      message:
        'AI spec identity matches more than one setup axle; apply rejected to avoid cross-axle assignment',
    };
  }

  return { ok: true, matchedAxleCount: 1 };
}

function identityTuplesEqual(
  a: AiTireSpecPayloadIdentity,
  b: AiTireSpecPayloadIdentity,
): boolean {
  const ta = buildJobAxleIdentityTuple(a);
  const tb = buildJobAxleIdentityTuple(b);
  if (!ta || !tb) return false;
  return tuplesEqual(ta, tb);
}

export function validateApplyGenerationBinding(args: {
  binding: AiTireSpecApplyGenerationBinding;
  setup: TireSetupIdentitySnapshot & { updatedAt: Date };
  spec: AiTireSpec;
}): PayloadIdentityValidationResult {
  if (args.binding.tireSetupId !== args.setup.id) {
    return {
      ok: false,
      code: 'GENERATION_SETUP_MISMATCH',
      message: 'Generation binding tire setup does not match target setup',
    };
  }

  const setupUpdatedAt = args.setup.updatedAt.toISOString();
  if (args.binding.setupUpdatedAt !== setupUpdatedAt) {
    return {
      ok: false,
      code: 'STALE_GENERATION_BINDING',
      message: 'Tire setup changed after AI spec was generated; fetch AI spec again',
    };
  }

  const requestIdentity: AiTireSpecPayloadIdentity = {
    tireSize: args.binding.requestTireSize.trim(),
    loadIndex: args.binding.requestLoadIndex.trim(),
    speedIndex: args.binding.requestSpeedIndex.trim(),
  };
  if (
    !requestIdentity.tireSize ||
    !requestIdentity.loadIndex ||
    !requestIdentity.speedIndex
  ) {
    return {
      ok: false,
      code: 'INCOMPLETE_GENERATION_BINDING',
      message: 'Generation binding is missing request tire identity',
    };
  }

  const payloadIdentity = extractPayloadIdentityFromSpec(args.spec);
  if (!payloadIdentity) {
    return {
      ok: false,
      code: 'INCOMPLETE_SPEC_IDENTITY',
      message:
        'AI tire spec payload lacks complete size, load index, and speed index identity',
    };
  }

  if (!identityTuplesEqual(payloadIdentity, requestIdentity)) {
    return {
      ok: false,
      code: 'PAYLOAD_GENERATION_IDENTITY_MISMATCH',
      message: 'AI spec payload identity does not match the identity used at generation time',
    };
  }

  const requestOnSetup = countPhysicalAxlesMatchingIdentity(requestIdentity, args.setup);
  if (requestOnSetup !== 1) {
    return {
      ok: false,
      code:
        requestOnSetup === 0
          ? 'GENERATION_AXLE_IDENTITY_MISMATCH'
          : 'AMBIGUOUS_AXLE_BINDING',
      message:
        requestOnSetup === 0
          ? 'Generation request identity does not match any complete setup axle'
          : 'Generation request identity is ambiguous across setup axles',
    };
  }

  return validatePayloadIdentityAgainstSetup(args.spec, args.setup);
}
