import { buildFindingFingerprint } from './fingerprint.mjs';
import {
  ACTIONABLE_HOST_CLASSIFICATIONS,
  CLASSIFICATIONS,
  DEFERRED_CLASSIFICATIONS,
} from './classifications.mjs';

function normalizePath(path) {
  return String(path ?? '').replace(/\\/g, '/');
}

function ruleMatchesFinding(rule, finding) {
  const file = normalizePath(finding.file);
  if (rule.pathExact && normalizePath(rule.pathExact) !== file) return false;
  if (rule.pathPattern) {
    const re = new RegExp(rule.pathPattern);
    if (!re.test(file)) return false;
  }
  if (rule.category && rule.category !== finding.category) return false;
  if (rule.presentationOwner && rule.presentationOwner !== finding.presentationOwner) return false;
  if (rule.surface && rule.surface !== finding.surface) return false;
  if (rule.module && rule.module !== finding.module) return false;
  if (rule.severity && rule.severity !== finding.severity) return false;
  if (rule.sampleIncludes) {
    const sample = String(finding.sample ?? '').toLowerCase();
    if (!sample.includes(String(rule.sampleIncludes).toLowerCase())) return false;
  }
  return true;
}

export function classifyFinding(finding, manifest) {
  const fingerprint = finding.fingerprint ?? buildFindingFingerprint(finding);

  if (finding.category === 'FORMAT_LOCALE') {
    return {
      fingerprint,
      classification: CLASSIFICATIONS.MACHINE_DOMAIN,
      source: 'intrinsic',
      manifestRef: 'format-locale',
    };
  }

  for (const entry of manifest.entries ?? []) {
    const entryFingerprint = entry.fingerprint ?? buildFindingFingerprint(entry);
    if (entryFingerprint === fingerprint) {
      return {
        fingerprint,
        classification: entry.classification,
        source: 'entry',
        manifestRef: entry.id ?? entryFingerprint,
      };
    }
  }

  for (const rule of manifest.rules ?? []) {
    if (ruleMatchesFinding(rule, finding)) {
      return {
        fingerprint,
        classification: rule.classification,
        source: 'rule',
        manifestRef: rule.id ?? rule.pathPattern ?? rule.pathExact,
      };
    }
  }

  return {
    fingerprint,
    classification:
      finding.severity === 'enforce-clean'
        ? CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED
        : CLASSIFICATIONS.HOST_PRESENTATION,
    source: 'default',
    manifestRef: null,
  };
}

function isActiveHostDebt(finding, classification, source) {
  if (classification === CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED) return true;
  if (finding.severity === 'enforce-clean' && source === 'default') return true;
  return false;
}

export function compareFindingsToManifest(findings, manifest) {
  const classified = [];
  const unclassified = [];
  const newUnclassifiedActive = [];

  for (const finding of findings) {
    const result = classifyFinding(finding, manifest);
    const enriched = {
      ...finding,
      fingerprint: result.fingerprint,
      classification: result.classification,
      classificationSource: result.source,
      manifestRef: result.manifestRef,
    };

    if (result.source === 'default') {
      unclassified.push(enriched);
    } else {
      classified.push(enriched);
    }

    if (isActiveHostDebt(enriched, result.classification, result.source)) {
      newUnclassifiedActive.push(enriched);
    }
  }

  const byClassification = {};
  for (const finding of [...classified, ...unclassified]) {
    byClassification[finding.classification] = (byClassification[finding.classification] ?? 0) + 1;
  }

  return {
    totalFindings: findings.length,
    classifiedResidualCount: classified.length,
    unclassifiedCount: unclassified.length,
    newUnclassifiedActiveHostDebtCount: newUnclassifiedActive.length,
    newUnclassifiedActiveHostDebt: newUnclassifiedActive,
    classifiedResidual: classified,
    unclassified,
    byClassification,
  };
}

export function formatDiagnostic(finding) {
  return {
    path: finding.file,
    line: finding.line,
    column: finding.column ?? null,
    kind: finding.kind ?? finding.category,
    presentationOwner: finding.presentationOwner ?? null,
    literal: finding.sample,
    fingerprint: finding.fingerprint,
    classification: finding.classification ?? null,
    classificationStatus: finding.classificationSource ?? 'unclassified',
    suggestedAction:
      finding.classification === CLASSIFICATIONS.HOST_PRESENTATION
        ? 'Move host copy into translation dictionary via t() or a presentation adapter.'
        : finding.classification === CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED
          ? 'Remediate on enforce-clean surface before merge.'
          : 'Classify in i18n-debt-classifications.json if justified deferred debt.',
  };
}
