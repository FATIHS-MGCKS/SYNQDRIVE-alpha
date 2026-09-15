import { createRequire } from 'node:module';
import * as path from 'node:path';

const nodeRequire = createRequire(__filename);
const opsLib = nodeRequire(path.join(__dirname, 'physical-state-cutover-evidence.ops-lib.cjs')) as {
  canonicalizeCutoverEvidencePayload: (payload: unknown) => string;
  hashCanonicalCutoverEvidencePayload: (payload: unknown) => string;
};

const ISO_8601_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function assertCanonicalIso8601Utc(value: string): string {
  if (!ISO_8601_UTC.test(value)) {
    throw new Error('non_canonical_timestamp');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('invalid_timestamp');
  }
  return new Date(parsed).toISOString();
}

/** Runtime canonical serialization — shared trust root with ops CLI (ops-lib.mjs). */
export const canonicalizeCutoverEvidencePayload = opsLib.canonicalizeCutoverEvidencePayload;

/** Runtime payload digest — shared trust root with ops CLI (ops-lib.mjs). */
export const hashCanonicalCutoverEvidencePayload = opsLib.hashCanonicalCutoverEvidencePayload;
