import { Prisma } from '@prisma/client';

const INPUT_DIGEST_FIELD_MARKERS = ['input_digest', 'inputDigest'] as const;
const SEMANTIC_REVISION_FIELD_MARKERS = ['semantic_revision', 'semanticRevision'] as const;

function targetFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.map((entry) => String(entry));
  }
  if (typeof target === 'string') {
    return [target];
  }
  return [];
}

export function isKnownBatteryRestSessionFeatureUniqueRace(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (error.meta?.modelName === 'BatteryRestSessionFeature') {
    return true;
  }
  const fields = targetFields(error);
  if (fields.length === 0) {
    return false;
  }
  const joined = fields.join(',');
  if (
    joined.includes('battery_rest_session_feature_input_digest') ||
    joined.includes('battery_rest_session_feature_semantic_revision')
  ) {
    return true;
  }
  const hasInputDigest = INPUT_DIGEST_FIELD_MARKERS.some((marker) =>
    fields.some((field) => field === marker || field.includes(marker)),
  );
  const hasSemanticRevision = SEMANTIC_REVISION_FIELD_MARKERS.some((marker) =>
    fields.some((field) => field === marker || field.includes(marker)),
  );
  return hasInputDigest || hasSemanticRevision;
}

export function isRetryableRestSessionFeatureComputationConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    return true;
  }
  return isKnownBatteryRestSessionFeatureUniqueRace(error);
}
