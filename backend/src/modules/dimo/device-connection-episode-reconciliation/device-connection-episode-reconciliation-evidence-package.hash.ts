import { createHash } from 'crypto';
import type { EpisodeReconciliationEvidencePackage } from './device-connection-episode-reconciliation-evidence-package.types';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashEvidencePackage(
  pkg: Omit<EpisodeReconciliationEvidencePackage, 'evidenceHash'> | EpisodeReconciliationEvidencePackage,
): string {
  const { evidenceHash: _ignored, ...body } = pkg as EpisodeReconciliationEvidencePackage;
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

export function withEvidenceHash(
  pkg: Omit<EpisodeReconciliationEvidencePackage, 'evidenceHash'>,
): EpisodeReconciliationEvidencePackage {
  const evidenceHash = hashEvidencePackage(pkg);
  return { ...pkg, evidenceHash };
}
