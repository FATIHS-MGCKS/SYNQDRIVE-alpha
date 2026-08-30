import { buildFindingFingerprint } from './fingerprint.mjs';
import {
  ACTIONABLE_HOST_CLASSIFICATIONS,
  CLASSIFICATIONS,
  SEMANTIC_CLASSIFICATIONS,
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

function buildBaselineSet(manifest) {
  return new Set(manifest.baselineFingerprints ?? []);
}

export function classifyFinding(finding, manifest) {
  const fingerprint = finding.fingerprint ?? buildFindingFingerprint(finding);
  const baseline = buildBaselineSet(manifest);

  if (finding.category === 'FORMAT_LOCALE') {
    return {
      fingerprint,
      classification: CLASSIFICATIONS.MACHINE_DOMAIN,
      source: 'intrinsic',
      manifestRef: 'format-locale',
      isBaselineKnown: baseline.has(fingerprint),
      isNewUnclassifiedActiveHostDebt: false,
    };
  }

  for (const entry of manifest.entries ?? []) {
    const entryFingerprint = entry.fingerprint ?? buildFindingFingerprint(entry);
    if (entryFingerprint !== fingerprint) continue;
    return {
      fingerprint,
      classification: entry.classification,
      source: 'entry',
      manifestRef: entry.id ?? entryFingerprint,
      isBaselineKnown: baseline.has(fingerprint),
      isNewUnclassifiedActiveHostDebt: isNewUnclassifiedActiveHostDebt(
        finding,
        entry.classification,
        'entry',
        baseline,
      ),
    };
  }

  for (const rule of manifest.rules ?? []) {
    if (!ruleMatchesFinding(rule, finding)) continue;
    if (finding.severity === 'enforce-clean') {
      break;
    }
    return {
      fingerprint,
      classification: rule.classification,
      source: 'rule',
      manifestRef: rule.id ?? rule.pathPattern ?? rule.pathExact,
      isBaselineKnown: baseline.has(fingerprint),
      isNewUnclassifiedActiveHostDebt: false,
    };
  }

  if (baseline.has(fingerprint)) {
    if (finding.severity === 'enforce-clean') {
      return {
        fingerprint,
        classification: CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED,
        source: 'baseline',
        manifestRef: 'baseline-fingerprint',
        isBaselineKnown: true,
        isNewUnclassifiedActiveHostDebt: false,
      };
    }
    return {
      fingerprint,
      classification: CLASSIFICATIONS.PREEXISTING_BASELINE_DEBT,
      source: 'baseline',
      manifestRef: 'baseline-fingerprint',
      isBaselineKnown: true,
      isNewUnclassifiedActiveHostDebt: false,
    };
  }

  const classification =
    finding.severity === 'enforce-clean'
      ? CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED
      : CLASSIFICATIONS.HOST_PRESENTATION;

  return {
    fingerprint,
    classification,
    source: 'default',
    manifestRef: null,
    isBaselineKnown: false,
    isNewUnclassifiedActiveHostDebt: isNewUnclassifiedActiveHostDebt(
      finding,
      classification,
      'default',
      baseline,
    ),
  };
}

export function isNewUnclassifiedActiveHostDebt(finding, classification, source, baseline) {
  const fingerprint = finding.fingerprint ?? buildFindingFingerprint(finding);
  if (baseline.has(fingerprint)) return false;
  if (SEMANTIC_CLASSIFICATIONS.has(classification) && source !== 'default') return false;
  return ACTIONABLE_HOST_CLASSIFICATIONS.has(classification);
}

function isActiveRemediationFinding(finding, classification) {
  return classification === CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED;
}

export function compareFindingsToManifest(findings, manifest) {
  const classified = [];
  const unclassified = [];
  const newUnclassifiedActive = [];
  const baselineResidual = [];
  const activeRemediation = [];

  for (const finding of findings) {
    const result = classifyFinding(finding, manifest);
    const enriched = {
      ...finding,
      fingerprint: result.fingerprint,
      classification: result.classification,
      classificationSource: result.source,
      manifestRef: result.manifestRef,
      isBaselineKnown: result.isBaselineKnown,
    };

    if (result.source === 'default') {
      unclassified.push(enriched);
    } else {
      classified.push(enriched);
    }

    if (result.classification === CLASSIFICATIONS.PREEXISTING_BASELINE_DEBT) {
      baselineResidual.push(enriched);
    }

    if (isActiveRemediationFinding(enriched, result.classification)) {
      activeRemediation.push(enriched);
    }

    if (result.isNewUnclassifiedActiveHostDebt) {
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
    baselineResidualCount: baselineResidual.length,
    activeRemediationCount: activeRemediation.length,
    newUnclassifiedActiveHostDebtCount: newUnclassifiedActive.length,
    newUnclassifiedActiveHostDebt: newUnclassifiedActive,
    activeRemediationFindings: activeRemediation,
    baselineResidual,
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
    structuralContext: finding.structuralContext ?? null,
    literal: finding.sample,
    fingerprint: finding.fingerprint,
    classification: finding.classification ?? null,
    classificationStatus: finding.classificationSource ?? 'unclassified',
    suggestedAction:
      finding.classification === CLASSIFICATIONS.HOST_PRESENTATION
        ? 'Move host copy into translation dictionary via t() or a presentation adapter.'
        : finding.classification === CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED
          ? 'Remediate on enforce-clean surface before merge.'
          : finding.classification === CLASSIFICATIONS.PREEXISTING_BASELINE_DEBT
            ? 'Known baseline residual debt — track but do not treat as newly introduced.'
            : 'Classify in i18n-debt-classifications.json if justified deferred debt.',
  };
}
