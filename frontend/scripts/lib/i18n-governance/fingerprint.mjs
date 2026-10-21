import { createHash } from 'node:crypto';

export const FINGERPRINT_VERSION = 3;

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
 * Stable grouping key for occurrence ordinals within a file.
 */
export function buildOccurrenceGroupKey(finding) {
  return [
    String(finding.file ?? '').replace(/\\/g, '/'),
    finding.structuralContext || 'module',
    finding.category ?? '',
    finding.presentationOwner ?? '',
    finding.kind ?? '',
    normalizeLiteral(finding.sample),
  ].join('|');
}

/**
 * Assign deterministic occurrence ordinals within identical signature groups.
 */
export function assignOccurrenceOrdinals(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = buildOccurrenceGroupKey(finding);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        a.line - b.line ||
        (a.column ?? 0) - (b.column ?? 0) ||
        String(a.category).localeCompare(String(b.category)) ||
        String(a.sample).localeCompare(String(b.sample)),
    );
    for (const [index, finding] of group.entries()) {
      finding.occurrenceOrdinal = index;
    }
  }

  return findings;
}

/**
 * Deterministic finding fingerprint v3 (line-independent).
 * file + category + presentationOwner + kind + structuralContext + normalizedLiteral + occurrenceOrdinal
 */
export function buildFindingFingerprint({
  file,
  category,
  presentationOwner = '',
  sample = '',
  kind = '',
  structuralContext = 'module',
  occurrenceOrdinal = 0,
}) {
  const payload = [
    file.replace(/\\/g, '/'),
    category,
    presentationOwner,
    kind,
    structuralContext || 'module',
    normalizeLiteral(sample),
    String(occurrenceOrdinal),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function finalizeGovernanceFindings(findings) {
  assignOccurrenceOrdinals(findings);
  for (const finding of findings) {
    finding.fingerprint = buildFindingFingerprint({
      file: finding.file,
      category: finding.category,
      presentationOwner: finding.presentationOwner ?? '',
      sample: finding.sample,
      kind: finding.kind ?? '',
      structuralContext: finding.structuralContext ?? 'module',
      occurrenceOrdinal: finding.occurrenceOrdinal ?? 0,
    });
  }
  return findings;
}

export function buildManifestEntryFingerprint(entry) {
  return buildFindingFingerprint({
    file: entry.file ?? entry.path ?? '',
    category: entry.category ?? entry.kind ?? '',
    presentationOwner: entry.presentationOwner ?? '',
    sample: entry.literal ?? entry.sample ?? entry.framing ?? '',
    kind: entry.kind ?? '',
    structuralContext: entry.structuralContext ?? 'module',
    occurrenceOrdinal: entry.occurrenceOrdinal ?? 0,
  });
}
