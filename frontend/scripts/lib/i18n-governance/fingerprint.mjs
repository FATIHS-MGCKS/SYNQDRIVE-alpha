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
 * Deterministic finding fingerprint v2 (line-independent).
 * file + category + presentationOwner + kind + structuralContext + normalized literal.
 */
export function buildFindingFingerprint({
  file,
  category,
  presentationOwner = '',
  sample = '',
  kind = '',
  structuralContext = 'module',
}) {
  const payload = [
    file.replace(/\\/g, '/'),
    category,
    presentationOwner,
    kind,
    structuralContext || 'module',
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
    structuralContext: entry.structuralContext ?? 'module',
  });
}
