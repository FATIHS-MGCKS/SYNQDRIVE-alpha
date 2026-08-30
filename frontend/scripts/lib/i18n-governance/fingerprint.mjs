import { createHash } from 'node:crypto';

/**
 * Normalize literal text for stable fingerprinting across line shifts.
 */
export function normalizeLiteral(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Deterministic finding fingerprint (line-independent).
 * file + category + presentationOwner + normalized literal/sample.
 */
export function buildFindingFingerprint({
  file,
  category,
  presentationOwner = '',
  sample = '',
  kind = '',
}) {
  const payload = [
    file.replace(/\\/g, '/'),
    category,
    presentationOwner,
    kind,
    normalizeLiteral(sample),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function buildManifestEntryFingerprint(entry) {
  return buildFindingFingerprint({
    file: entry.file ?? entry.path ?? '',
    category: entry.category ?? entry.kind ?? '',
    presentationOwner: entry.presentationOwner ?? '',
    sample: entry.literal ?? entry.sample ?? entry.framing ?? '',
    kind: entry.kind ?? '',
  });
}
