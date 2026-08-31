#!/usr/bin/env node
/**
 * P2.3.3 — Base-aware changed-file / new-debt PR gate.
 */
import { appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { scanSource, isScannerEligibleRelativePath } from './i18n-hardcoded-scan.mjs';
import { loadManifest } from './lib/i18n-governance/manifest-validator.mjs';
import {
  aggregateComparisonResults,
  buildFileScanUnits,
  buildGateSummary,
  compareBaseAndHeadFindings,
  formatDiagnosticLine,
} from './lib/i18n-governance/pr-gate.mjs';
import {
  EXIT_CODES,
  evaluateGovernanceAuthorityPolicy,
  partitionChangedPaths,
} from './lib/i18n-governance/pr-gate-policy.mjs';
import { parseNameStatusZGit, collectChangedPaths } from './lib/i18n-governance/git-diff.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const repoRoot = join(frontendRoot, '..');
const manifestPath = join(frontendRoot, 'src/i18n/i18n-debt-classifications.json');

const SHA_RE = /^[0-9a-f]{40}$/i;
const MAX_CONSOLE_DIAGNOSTICS = 50;

function parseArgs(argv) {
  const args = {
    baseSha: null,
    headSha: null,
    authorityApproved: false,
    repoRoot,
    manifestPath,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--base-sha') {
      args.baseSha = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--head-sha') {
      args.headSha = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--authority-approved') {
      args.authorityApproved = true;
      continue;
    }
    if (token === '--repo-root') {
      args.repoRoot = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function gitExec(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function validateSha(repo, sha, label) {
  if (!sha || !SHA_RE.test(sha)) {
    throw new Error(`${label} SHA missing or invalid`);
  }
  const result = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${label} SHA does not exist locally: ${sha}`);
  }
}

function readSourceAtRef(repo, ref, repoPath) {
  try {
    return gitExec(repo, ['show', `${ref}:${repoPath}`]);
  } catch {
    return null;
  }
}

function scanAtRef(ref, relPath, repoPath, repo) {
  const source = readSourceAtRef(repo, ref, repoPath);
  if (source == null) return [];
  return scanSource(relPath, source, { includeEnhanced: true });
}

function emitGithubAnnotation(diagnostic) {
  const file = `frontend/src/${diagnostic.path}`;
  const line = diagnostic.line ?? 1;
  const message = [
    'Hardcoded host presentation introduced by PR.',
    `reason=${diagnostic.reason}`,
    `literal="${diagnostic.literal}"`,
  ].join(' ');
  console.error(`::error file=${file},line=${line}::${message}`);
}

function writeStepSummary(summary, diagnostics) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    `## i18n PR new-debt gate`,
    ``,
    `- **Result:** ${summary.pass ? 'PASS' : 'FAIL'}`,
    `- **Base:** \`${summary.baseSha}\``,
    `- **Head:** \`${summary.headSha}\``,
    `- **Changed governed production files:** ${summary.changedGovernedProductionFiles}`,
    `- **NEW_PR_ACTIONABLE_HOST_DEBT:** ${summary.newPrActionableHostDebt}`,
    `- **REINTRODUCED_HISTORICAL_DEBT:** ${summary.reintroducedHistoricalDebt}`,
    `- **UNCHANGED_PREEXISTING_RESIDUAL_DEBT:** ${summary.unchangedPreexistingResidualDebt}`,
    `- **ALLOWED_NEW_SEMANTIC_FINDINGS:** ${summary.allowedNewSemanticFindings}`,
    `- **Governance authority changed:** ${summary.governanceAuthorityChanged}`,
    `- **Mixed authority/product:** ${summary.mixedAuthorityProductChange}`,
    ``,
  ];
  if (diagnostics.length > 0) {
    lines.push('### Blocking diagnostics');
    for (const diagnostic of diagnostics.slice(0, 20)) {
      lines.push(
        `- \`${diagnostic.path}:${diagnostic.line}\` ${diagnostic.literal} (${diagnostic.reason})`,
      );
    }
  }
  appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

function printSummary(summary) {
  console.log(`I18N_PR_GATE=${summary.pass ? 'PASS' : 'FAIL'}`);
  console.log(`BASE_SHA=${summary.baseSha}`);
  console.log(`HEAD_SHA=${summary.headSha}`);
  console.log(`CHANGED_GOVERNED_PRODUCTION_FILES=${summary.changedGovernedProductionFiles}`);
  console.log(`NEW_PR_ACTIONABLE_HOST_DEBT=${summary.newPrActionableHostDebt}`);
  console.log(`REINTRODUCED_HISTORICAL_DEBT=${summary.reintroducedHistoricalDebt}`);
  console.log(`UNCHANGED_PREEXISTING_RESIDUAL_DEBT=${summary.unchangedPreexistingResidualDebt}`);
  console.log(`ALLOWED_NEW_SEMANTIC_FINDINGS=${summary.allowedNewSemanticFindings}`);
  console.log(`UNGOVERNED_PRODUCTION_PATHS=${summary.ungovernedProductionPaths.length}`);
  console.log(`UNSUPPORTED_PRODUCTION_EXTENSIONS=${summary.unsupportedProductionPaths.length}`);
  console.log(`GOVERNANCE_AUTHORITY_CHANGED=${summary.governanceAuthorityChanged}`);
  console.log(`MIXED_AUTHORITY_PRODUCT_CHANGE=${summary.mixedAuthorityProductChange}`);
}

function runGate(options) {
  const manifest = loadManifest(options.manifestPath);
  validateSha(options.repoRoot, options.baseSha, 'Base');
  validateSha(options.repoRoot, options.headSha, 'Head');

  const diffBuffer = execFileSync(
    'git',
    ['diff', '--name-status', '-z', '-M', `${options.baseSha}...${options.headSha}`],
    { cwd: options.repoRoot },
  );
  const diffEntries = parseNameStatusZGit(diffBuffer);
  const changedPaths = collectChangedPaths(diffEntries);
  const partitions = partitionChangedPaths(changedPaths, isScannerEligibleRelativePath);
  const authority = evaluateGovernanceAuthorityPolicy({
    authorityPaths: partitions.authorityPaths,
    governedProductionPaths: partitions.governedProductionPaths,
    authorityApproved: options.authorityApproved,
  });

  if (!authority.ok) {
    const summary = buildGateSummary({
      baseSha: options.baseSha,
      headSha: options.headSha,
      changedGovernedProductionFiles: partitions.governedProductionPaths.length,
      comparison: {
        newPrActionableHostDebt: 0,
        reintroducedHistoricalDebt: [],
        unchangedPreexistingResidualDebt: 0,
        allowedNewSemanticFindings: 0,
        blockingFindings: [],
      },
      authority,
      ungovernedProductionPaths: partitions.ungovernedProductionPaths,
      unsupportedProductionPaths: partitions.unsupportedProductionPaths,
    });
    printSummary(summary);
    return summary;
  }

  if (partitions.ungovernedProductionPaths.length > 0 || partitions.unsupportedProductionPaths.length > 0) {
    const summary = buildGateSummary({
      baseSha: options.baseSha,
      headSha: options.headSha,
      changedGovernedProductionFiles: partitions.governedProductionPaths.length,
      comparison: {
        newPrActionableHostDebt: 0,
        reintroducedHistoricalDebt: [],
        unchangedPreexistingResidualDebt: 0,
        allowedNewSemanticFindings: 0,
        blockingFindings: [],
      },
      authority,
      ungovernedProductionPaths: partitions.ungovernedProductionPaths,
      unsupportedProductionPaths: partitions.unsupportedProductionPaths,
    });
    printSummary(summary);
    for (const path of partitions.ungovernedProductionPaths) {
      console.error(`UNGOVERNED_PRODUCTION_SOURCE_PATH ${path}`);
    }
    for (const path of partitions.unsupportedProductionPaths) {
      console.error(`UNSUPPORTED_GOVERNED_SOURCE_EXTENSION ${path}`);
    }
    return summary;
  }

  const governedSet = new Set(partitions.governedProductionPaths);
  const scanUnits = buildFileScanUnits(
    diffEntries.filter((entry) => {
      if (entry.oldPath && governedSet.has(entry.oldPath)) return true;
      if (entry.newPath && governedSet.has(entry.newPath)) return true;
      return false;
    }),
  );

  const perFileResults = scanUnits.map((unit) => {
    const baseRepoPath = unit.baseRelPath ? `frontend/src/${unit.baseRelPath}` : null;
    const headRepoPath = unit.headRelPath ? `frontend/src/${unit.headRelPath}` : null;
    const baseFindings =
      unit.baseRelPath && baseRepoPath
        ? scanAtRef(options.baseSha, unit.baseRelPath, baseRepoPath, options.repoRoot)
        : [];
    const headFindings =
      unit.headRelPath && headRepoPath
        ? scanAtRef(options.headSha, unit.headRelPath, headRepoPath, options.repoRoot)
        : [];
    return compareBaseAndHeadFindings({
      baseFindings,
      headFindings,
      manifest,
    });
  });

  const comparison = aggregateComparisonResults(perFileResults);
  const summary = buildGateSummary({
    baseSha: options.baseSha,
    headSha: options.headSha,
    changedGovernedProductionFiles: partitions.governedProductionPaths.length,
    comparison,
    authority,
    ungovernedProductionPaths: [],
    unsupportedProductionPaths: [],
  });

  const diagnostics = [
    ...comparison.blockingFindings.map((finding) => formatDiagnosticLine(finding)),
    ...comparison.reintroducedHistoricalDebt.map((finding) =>
      formatDiagnosticLine(finding, { reason: 'REINTRODUCED_HISTORICAL_DEBT' }),
    ),
  ];

  printSummary(summary);
  for (const diagnostic of diagnostics.slice(0, MAX_CONSOLE_DIAGNOSTICS)) {
    console.error(JSON.stringify(diagnostic));
    emitGithubAnnotation(diagnostic);
  }
  if (diagnostics.length > MAX_CONSOLE_DIAGNOSTICS) {
    console.error(`... ${diagnostics.length - MAX_CONSOLE_DIAGNOSTICS} additional diagnostics omitted`);
  }

  writeStepSummary(summary, diagnostics);
  return summary;
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const headSha = args.headSha ?? gitExec(args.repoRoot, ['rev-parse', 'HEAD']).trim();
    const summary = runGate({
      ...args,
      headSha,
    });
    process.exit(summary.exitCode);
  } catch (error) {
    console.error(`I18N_PR_GATE=FAIL`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT_CODES.INVALID_BASE_OR_GIT);
  }
}

const isCliMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCliMain) {
  main();
}

export { runGate, parseArgs, scanAtRef };
