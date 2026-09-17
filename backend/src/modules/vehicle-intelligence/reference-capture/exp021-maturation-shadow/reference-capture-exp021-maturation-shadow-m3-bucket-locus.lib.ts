import {
  buildExp021BucketIdentity,
  CANONICAL_EXP021_BUCKET_IDENTITY,
} from '../reference-capture-settlement-shadow-bucket-identity';
import { canonicalizeBucketTimestamp } from '../reference-capture-hf-aggregate-bucket-analysis';
import { Exp021MaturationShadowM3BucketLocusError } from './reference-capture-exp021-maturation-shadow-m3.errors';
import type { Exp021MaturationShadowM3BucketLocusReconstruction } from './reference-capture-exp021-maturation-shadow-m3.types';

export function parseBucketLocusManifest(manifest: unknown): string[] {
  if (!Array.isArray(manifest)) {
    throw new Exp021MaturationShadowM3BucketLocusError('bucketLocusManifestJson must be a string array');
  }
  const loci: string[] = [];
  for (const entry of manifest) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Exp021MaturationShadowM3BucketLocusError(
        'bucketLocusManifestJson entries must be non-empty strings',
      );
    }
    loci.push(entry);
  }
  return loci;
}

export function assertSupportedBucketLocusIdentityVersion(version: string | null | undefined): string {
  if (!version) {
    throw new Exp021MaturationShadowM3BucketLocusError('bucketLocusIdentityVersion is required');
  }
  if (version !== CANONICAL_EXP021_BUCKET_IDENTITY) {
    throw new Exp021MaturationShadowM3BucketLocusError(
      `Unsupported bucketLocusIdentityVersion: ${version}; expected ${CANONICAL_EXP021_BUCKET_IDENTITY}`,
    );
  }
  return version;
}

export function validateCanonicalBucketLocusIdentity(locus: string): string {
  const pipeIndex = locus.indexOf('|');
  if (pipeIndex <= 0) {
    throw new Exp021MaturationShadowM3BucketLocusError(`Malformed bucket locus identity: ${locus}`);
  }
  if (locus.indexOf('|', pipeIndex + 1) >= 0) {
    throw new Exp021MaturationShadowM3BucketLocusError(`Malformed bucket locus identity: ${locus}`);
  }

  const providerField = locus.slice(0, pipeIndex);
  const providerTimestamp = locus.slice(pipeIndex + 1);
  if (!providerField) {
    throw new Exp021MaturationShadowM3BucketLocusError(`Malformed bucket locus identity: ${locus}`);
  }
  if (!providerTimestamp) {
    throw new Exp021MaturationShadowM3BucketLocusError(`Malformed bucket locus identity: ${locus}`);
  }

  let canonicalTimestamp: string;
  try {
    canonicalTimestamp = canonicalizeBucketTimestamp(providerTimestamp);
  } catch {
    throw new Exp021MaturationShadowM3BucketLocusError(`Invalid bucket locus timestamp: ${locus}`);
  }

  const roundTrip = buildExp021BucketIdentity(providerField, canonicalTimestamp);
  if (roundTrip !== locus) {
    throw new Exp021MaturationShadowM3BucketLocusError(
      `Non-canonical bucket locus identity: ${locus}; expected ${roundTrip}`,
    );
  }

  return locus;
}

export function dedupeBucketLoci(loci: string[]): string[] {
  return [...new Set(loci)].sort((a, b) => a.localeCompare(b));
}

export function reconstructBucketLociFromAttempt(input: {
  bucketLocusManifestJson: unknown;
  bucketLocusIdentityVersion: string | null;
  uniqueBucketLocusCount: number | null;
}): Exp021MaturationShadowM3BucketLocusReconstruction {
  const identityVersion = assertSupportedBucketLocusIdentityVersion(input.bucketLocusIdentityVersion);
  const rawLoci = parseBucketLocusManifest(input.bucketLocusManifestJson ?? []);
  const loci = dedupeBucketLoci(rawLoci.map((locus) => validateCanonicalBucketLocusIdentity(locus)));
  const uniqueCount = loci.length;
  const persistedUniqueCount = input.uniqueBucketLocusCount;
  const persistedCountConsistent =
    persistedUniqueCount == null ? true : persistedUniqueCount === uniqueCount;

  return {
    loci,
    uniqueCount,
    persistedUniqueCount,
    persistedCountConsistent,
    identityVersion,
  };
}

export function fieldFromBucketLocus(locus: string): string {
  const validated = validateCanonicalBucketLocusIdentity(locus);
  const pipeIndex = validated.indexOf('|');
  return validated.slice(0, pipeIndex);
}

export function groupBucketLociByField(loci: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const locus of loci) {
    const field = fieldFromBucketLocus(locus);
    if (!grouped[field]) grouped[field] = [];
    grouped[field].push(locus);
  }
  for (const field of Object.keys(grouped)) {
    grouped[field] = dedupeBucketLoci(grouped[field]);
  }
  return grouped;
}
