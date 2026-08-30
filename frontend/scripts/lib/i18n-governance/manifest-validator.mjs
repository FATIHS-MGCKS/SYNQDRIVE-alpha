import { readFileSync } from 'node:fs';
import { isKnownClassification } from './classifications.mjs';
import { buildFindingFingerprint, buildManifestEntryFingerprint } from './fingerprint.mjs';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateManifestSchema(manifest) {
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== 'object') {
    errors.push('Manifest must be an object.');
    return { valid: false, errors, warnings };
  }

  if (manifest.version !== 1) {
    errors.push(`Unsupported manifest version: ${manifest.version}`);
  }

  const seenFingerprints = new Set();
  const seenRuleIds = new Set();

  for (const [index, rule] of (manifest.rules ?? []).entries()) {
    const prefix = `rules[${index}]`;
    if (!isKnownClassification(rule.classification)) {
      errors.push(`${prefix}: unknown classification ${rule.classification}`);
    }
    if (!isNonEmptyString(rule.reason)) {
      errors.push(`${prefix}: missing reason`);
    }
    if (!isNonEmptyString(rule.owner)) {
      errors.push(`${prefix}: missing owner`);
    }
    if (!rule.pathPattern && !rule.pathExact) {
      errors.push(`${prefix}: requires pathPattern or pathExact`);
    }
    const id = rule.id ?? `${rule.pathPattern ?? rule.pathExact}:${rule.classification}`;
    if (seenRuleIds.has(id)) {
      errors.push(`${prefix}: duplicate rule id ${id}`);
    }
    seenRuleIds.add(id);
  }

  for (const [index, entry] of (manifest.entries ?? []).entries()) {
    const prefix = `entries[${index}]`;
    if (!isKnownClassification(entry.classification)) {
      errors.push(`${prefix}: unknown classification ${entry.classification}`);
    }
    if (!isNonEmptyString(entry.reason)) {
      errors.push(`${prefix}: missing reason`);
    }
    if (!isNonEmptyString(entry.owner)) {
      errors.push(`${prefix}: missing owner`);
    }
    if (!isNonEmptyString(entry.file ?? entry.path)) {
      errors.push(`${prefix}: missing file/path`);
    }
    if (!isNonEmptyString(entry.sample ?? entry.literal)) {
      errors.push(`${prefix}: missing sample/literal`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    seenFingerprints,
    seenRuleIds,
  };
}

export function validateManifestAgainstInventory(manifest, findings) {
  const schema = validateManifestSchema(manifest);
  const errors = [...schema.errors];
  const warnings = [...schema.warnings];
  const staleEntries = [];

  const findingFingerprints = new Set(
    findings.map((finding) => finding.fingerprint ?? buildFindingFingerprint(finding)),
  );

  for (const [index, entry] of (manifest.entries ?? []).entries()) {
    const fingerprint = entry.fingerprint ?? buildManifestEntryFingerprint(entry);
    if (!findingFingerprints.has(fingerprint)) {
      staleEntries.push({ index, fingerprint, file: entry.file ?? entry.path });
      warnings.push(`entries[${index}] appears stale (fingerprint ${fingerprint} not in current scan).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    staleEntries,
  };
}

export function loadManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
}
