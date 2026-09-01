import { normalizeLiteral } from './fingerprint.mjs';
import { classifyFinding } from './comparator.mjs';
import {
  ACTIONABLE_HOST_CLASSIFICATIONS,
  CLASSIFICATIONS,
} from './classifications.mjs';
import { toSrcRelativePath } from './git-diff.mjs';

const NEW_COPY_BLOCKED_CLASSIFICATIONS = new Set([
  CLASSIFICATIONS.DATA_ANALYSE_PLANNED_REMOVAL,
  CLASSIFICATIONS.IAM_PRODUCT_WIRING_REQUIRED,
  CLASSIFICATIONS.LEGACY_DEAD,
  CLASSIFICATIONS.OTHER_JUSTIFIED,
  CLASSIFICATIONS.PREEXISTING_BASELINE_DEBT,
  CLASSIFICATIONS.HOST_PRESENTATION,
  CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED,
]);

/**
 * PR-local semantic multiset identity (line/file neutral).
 */
export function buildPrLineageKey(finding) {
  return [
    finding.severity ?? '',
    finding.category ?? '',
    finding.presentationOwner ?? '',
    finding.kind ?? '',
    normalizeLiteral(finding.sample),
  ].join('|');
}

export function buildFindingMultiset(findings) {
  const multiset = new Map();
  for (const finding of findings) {
    const key = buildPrLineageKey(finding);
    const count = finding.occurrences ?? 1;
    multiset.set(key, (multiset.get(key) ?? 0) + count);
  }
  return multiset;
}

export function compareMultisetCounts(baseMultiset, headMultiset) {
  const keys = new Set([...baseMultiset.keys(), ...headMultiset.keys()]);
  const deltas = [];
  for (const key of [...keys].sort()) {
    const baseCount = baseMultiset.get(key) ?? 0;
    const headCount = headMultiset.get(key) ?? 0;
    const newOccurrences = Math.max(0, headCount - baseCount);
    const removedOccurrences = Math.max(0, baseCount - headCount);
    const unchangedOccurrences = Math.min(baseCount, headCount);
    deltas.push({
      key,
      baseCount,
      headCount,
      newOccurrences,
      removedOccurrences,
      unchangedOccurrences,
    });
  }
  return deltas;
}

export function buildFingerprintSet(findings) {
  return new Set(findings.map((finding) => finding.fingerprint).filter(Boolean));
}

export function detectReintroducedHistoricalDebt(baseFindings, headFindings, manifest) {
  const baseline = new Set(manifest.baselineFingerprints ?? []);
  const baseFingerprints = buildFingerprintSet(baseFindings);
  const reintroduced = [];

  for (const finding of headFindings) {
    if (!finding.fingerprint) continue;
    if (!baseline.has(finding.fingerprint)) continue;
    if (baseFingerprints.has(finding.fingerprint)) continue;
    reintroduced.push(finding);
  }

  return reintroduced.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      String(a.sample).localeCompare(String(b.sample)),
  );
}

export function evaluateNewFindingPolicy(finding, manifest) {
  const classified = classifyFinding(finding, manifest);

  if (classified.classification === CLASSIFICATIONS.MACHINE_DOMAIN) {
    return {
      block: false,
      classification: classified.classification,
      reason: 'ALLOWED_MACHINE_DOMAIN',
      manifestRef: classified.manifestRef,
      fingerprint: classified.fingerprint,
    };
  }

  if (
    classified.classification === CLASSIFICATIONS.RAW_PROVIDER ||
    classified.classification === CLASSIFICATIONS.RAW_USER
  ) {
    return {
      block: false,
      classification: classified.classification,
      reason: 'ALLOWED_RAW_SEMANTIC',
      manifestRef: classified.manifestRef,
      fingerprint: classified.fingerprint,
    };
  }

  if (classified.classification === CLASSIFICATIONS.EDITORIAL_CONTENT) {
    return {
      block: false,
      classification: classified.classification,
      reason: 'ALLOWED_EDITORIAL_CONTENT',
      manifestRef: classified.manifestRef,
      fingerprint: classified.fingerprint,
    };
  }

  if (NEW_COPY_BLOCKED_CLASSIFICATIONS.has(classified.classification)) {
    return {
      block: true,
      classification: classified.classification,
      reason: 'NEW_PR_ACTIONABLE_HOST_DEBT',
      manifestRef: classified.manifestRef,
      fingerprint: classified.fingerprint,
    };
  }

  if (finding.severity === 'enforce-clean') {
    return {
      block: true,
      classification: classified.classification,
      reason: 'NEW_ENFORCE_CLEAN_HOST_DEBT',
      manifestRef: classified.manifestRef,
      fingerprint: classified.fingerprint,
    };
  }

  return {
    block: false,
    classification: classified.classification,
    reason: 'ALLOWED_NEW_SEMANTIC_FINDING',
    manifestRef: classified.manifestRef,
    fingerprint: classified.fingerprint,
  };
}

function pickRepresentativeFinding(findings, key) {
  return (
    findings.find((finding) => buildPrLineageKey(finding) === key) ??
  findings[0]
  );
}

export function compareBaseAndHeadFindings({
  baseFindings,
  headFindings,
  manifest,
}) {
  const baseMultiset = buildFindingMultiset(baseFindings);
  const headMultiset = buildFindingMultiset(headFindings);
  const deltas = compareMultisetCounts(baseMultiset, headMultiset);

  const blockingFindings = [];
  const allowedSemanticFindings = [];
  let unchangedPreexistingResidualDebt = 0;
  let newPrActionableHostDebt = 0;

  for (const delta of deltas) {
    unchangedPreexistingResidualDebt += delta.unchangedOccurrences;
    if (delta.newOccurrences === 0) continue;

    const representative = pickRepresentativeFinding(headFindings, delta.key);
    const policy = evaluateNewFindingPolicy(representative, manifest);

    for (let index = 0; index < delta.newOccurrences; index += 1) {
      const enriched = {
        ...representative,
        prLineageKey: delta.key,
        baseCount: delta.baseCount,
        headCount: delta.headCount,
        policyReason: policy.reason,
        classification: policy.classification,
      };
      if (policy.block) {
        blockingFindings.push(enriched);
        newPrActionableHostDebt += 1;
      } else {
        allowedSemanticFindings.push(enriched);
      }
    }
  }

  const reintroducedHistoricalDebt = detectReintroducedHistoricalDebt(
    baseFindings,
    headFindings,
    manifest,
  );

  return {
    baseMultiset,
    headMultiset,
    deltas,
    blockingFindings: sortDiagnostics(blockingFindings),
    allowedSemanticFindings: sortDiagnostics(allowedSemanticFindings),
    unchangedPreexistingResidualDebt,
    newPrActionableHostDebt,
    reintroducedHistoricalDebt: sortDiagnostics(reintroducedHistoricalDebt),
    allowedNewSemanticFindings: allowedSemanticFindings.length,
  };
}

export function sortDiagnostics(findings) {
  return [...findings].sort(
    (a, b) =>
      String(a.file).localeCompare(String(b.file)) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      String(a.kind ?? a.category ?? '').localeCompare(String(b.kind ?? b.category ?? '')) ||
      String(a.sample ?? '').localeCompare(String(b.sample ?? '')) ||
      String(a.fingerprint ?? '').localeCompare(String(b.fingerprint ?? '')),
  );
}

export function buildFileScanUnits(diffEntries) {
  const units = [];
  const seen = new Set();

  for (const entry of diffEntries) {
    if (entry.status === 'R') {
      const oldRel = toSrcRelativePath(entry.oldPath);
      const newRel = toSrcRelativePath(entry.newPath);
      if (!oldRel || !newRel) continue;
      const key = `rename:${oldRel}->${newRel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      units.push({
        type: 'rename',
        baseRelPath: oldRel,
        headRelPath: newRel,
        oldRepoPath: entry.oldPath,
        newRepoPath: entry.newPath,
      });
      continue;
    }

    if (entry.status === 'C') {
      const newRel = toSrcRelativePath(entry.newPath);
      if (!newRel) continue;
      const key = `copy:${newRel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      units.push({
        type: 'copy',
        baseRelPath: null,
        headRelPath: newRel,
        oldRepoPath: entry.oldPath,
        newRepoPath: entry.newPath,
      });
      continue;
    }

    const repoPath = entry.newPath ?? entry.oldPath;
    const rel = toSrcRelativePath(repoPath);
    if (!rel) continue;
    const key = `path:${rel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push({
      type: entry.status === 'D' ? 'delete' : 'modify',
      baseRelPath: entry.status === 'A' ? null : rel,
      headRelPath: entry.status === 'D' ? null : rel,
      oldRepoPath: entry.oldPath,
      newRepoPath: entry.newPath,
    });
  }

  return units.sort((a, b) =>
    String(a.headRelPath ?? a.baseRelPath).localeCompare(String(b.headRelPath ?? b.baseRelPath)),
  );
}

export function evaluateChangedProductionPath({
  unit,
  baseFindings,
  headFindings,
  manifest,
}) {
  return compareBaseAndHeadFindings({
    baseFindings,
    headFindings,
    manifest,
  });
}

export function aggregateComparisonResults(results) {
  const blockingFindings = [];
  const allowedSemanticFindings = [];
  const reintroducedHistoricalDebt = [];
  let unchangedPreexistingResidualDebt = 0;
  let newPrActionableHostDebt = 0;
  let allowedNewSemanticFindings = 0;

  for (const result of results) {
    blockingFindings.push(...result.blockingFindings);
    allowedSemanticFindings.push(...result.allowedSemanticFindings);
    reintroducedHistoricalDebt.push(...result.reintroducedHistoricalDebt);
    unchangedPreexistingResidualDebt += result.unchangedPreexistingResidualDebt;
    newPrActionableHostDebt += result.newPrActionableHostDebt;
    allowedNewSemanticFindings += result.allowedNewSemanticFindings;
  }

  return {
    blockingFindings: sortDiagnostics(blockingFindings),
    allowedSemanticFindings: sortDiagnostics(allowedSemanticFindings),
    reintroducedHistoricalDebt: sortDiagnostics(
      dedupeByFingerprint(reintroducedHistoricalDebt),
    ),
    unchangedPreexistingResidualDebt,
    newPrActionableHostDebt,
    allowedNewSemanticFindings,
  };
}

function dedupeByFingerprint(findings) {
  const seen = new Set();
  const unique = [];
  for (const finding of findings) {
    const key = finding.fingerprint ?? `${finding.file}|${finding.line}|${finding.sample}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}

export function buildGateSummary({
  baseSha,
  headSha,
  changedGovernedProductionFiles,
  comparison,
  authority,
  ungovernedProductionPaths = [],
  unsupportedProductionPaths = [],
}) {
  const reintroducedCount = comparison.reintroducedHistoricalDebt.length;
  const pass =
    comparison.newPrActionableHostDebt === 0 &&
    reintroducedCount === 0 &&
    ungovernedProductionPaths.length === 0 &&
    unsupportedProductionPaths.length === 0 &&
    authority.ok;

  let exitCode = 0;
  if (!authority.ok) {
    exitCode = authority.exitCode;
  } else if (ungovernedProductionPaths.length > 0 || unsupportedProductionPaths.length > 0) {
    exitCode = 4;
  } else if (comparison.newPrActionableHostDebt > 0 || reintroducedCount > 0) {
    exitCode = 2;
  }

  return {
    pass,
    exitCode,
    baseSha,
    headSha,
    changedGovernedProductionFiles,
    newPrActionableHostDebt: comparison.newPrActionableHostDebt,
    reintroducedHistoricalDebt: reintroducedCount,
    unchangedPreexistingResidualDebt: comparison.unchangedPreexistingResidualDebt,
    allowedNewSemanticFindings: comparison.allowedNewSemanticFindings,
    ungovernedProductionPaths,
    unsupportedProductionPaths,
    governanceAuthorityChanged: authority.governanceAuthorityChanged ? 'YES' : 'NO',
    mixedAuthorityProductChange: authority.mixedAuthorityProductChange ? 'YES' : 'NO',
    authorityApproved: authority.authorityApproved,
    blockingFindings: comparison.blockingFindings,
    reintroducedFindings: comparison.reintroducedHistoricalDebt,
  };
}

export function formatDiagnosticLine(finding, extra = {}) {
  return {
    path: finding.file,
    line: finding.line,
    kind: finding.kind ?? finding.category,
    presentationOwner: finding.presentationOwner ?? null,
    literal: finding.sample,
    fingerprint: finding.fingerprint ?? null,
    prLineageKey: finding.prLineageKey ?? buildPrLineageKey(finding),
    baseCount: extra.baseCount ?? finding.baseCount ?? null,
    headCount: extra.headCount ?? finding.headCount ?? null,
    classification: finding.classification ?? null,
    reason: finding.policyReason ?? extra.reason ?? null,
    suggestedAction: finding.policyReason?.includes('ACTIONABLE')
      ? 'Replace host-owned presentation with t() or a presentation adapter.'
      : 'Remove reintroduced historical host copy or localize via t().',
  };
}
