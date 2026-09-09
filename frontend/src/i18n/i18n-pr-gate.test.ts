import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanSource, isScannerEligibleRelativePath } from '../../scripts/i18n-hardcoded-scan.mjs';
import { loadManifest } from '../../scripts/lib/i18n-governance/manifest-validator.mjs';
import { parseNameStatusZGit, toSrcRelativePath } from '../../scripts/lib/i18n-governance/git-diff.mjs';
import {
  GitSourceReadFailureError,
  readSourceAtRef,
} from '../../scripts/lib/i18n-governance/git-source.mjs';
import {
  buildFileScanUnits,
  buildPrLineageKey,
  compareBaseAndHeadFindings,
  compareMultisetCounts,
  buildFindingMultiset,
  buildGateSummary,
} from '../../scripts/lib/i18n-governance/pr-gate.mjs';
import {
  evaluateGovernanceAuthorityPolicy,
  hasI18nRelevantChanges,
  isGovernanceAuthorityPath,
  isI18nRelevantPath,
  partitionChangedPaths,
  EXIT_CODES,
  GOVERNANCE_AUTHORITY_PREFIXES,
  BOOTSTRAP_RELEVANT_PATH_CONTRACT,
  PROTECTED_GOVERNANCE_EXACT_PATHS,
  PROTECTED_GOVERNANCE_PREFIXES,
} from '../../scripts/lib/i18n-governance/pr-gate-policy.mjs';
import { gitExec, runGate } from '../../scripts/i18n-pr-gate.mjs';
import {
  CANONICAL_GOVERNANCE_EXACT_PATHS,
  CANONICAL_GOVERNANCE_PREFIX_RULES,
  isCanonicalGovernanceAuthorityPath,
  TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES,
} from '../../scripts/lib/i18n-governance/authority-path-contract.mjs';
import {
  analyzeExpectedVsParsedWorkflowParity,
  analyzeParsedWorkflowCanonicalParity,
  assertWorkflowAuthorityContractValid,
  assertWorkflowYamlSecurityInvariants,
  evaluateBootstrapSafety,
  evaluateSyntheticBoundaryWitnesses,
  extractIsAuthorityPathCasePatterns,
  isParsedWorkflowAuthorityPath,
  isParsedWorkflowProductOrPresentationPath,
  loadParsedWorkflowAuthorityContract,
  loadParsedWorkflowAuthorityPatterns,
  mutatePatternsBroadenI18nScriptWildcard,
  mutatePatternsReplaceWildcardWithExactList,
  mutateWorkflowContractInvertAuthorityReturn,
  mutateWorkflowYamlInsertUnsupportedPattern,
  mutateWorkflowYamlInvertAuthorityReturn,
  parseWorkflowAuthorityContract,
} from '../../scripts/lib/i18n-governance/workflow-authority-classifier.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, 'i18n-debt-classifications.json');
const manifest = loadManifest(manifestPath);
const fixtureRoot = join(__dirname, '__fixtures__/governance-adversarial');
const repoRoot = join(__dirname, '../../..');
const workflowPath = join(repoRoot, '.github/workflows/i18n-governance-new-debt.yml');
const authorityProtectionWorkflowPath = join(
  repoRoot,
  '.github/workflows/i18n-authority-protection.yml',
);
const authorityProtectionClassifierHarnessPath = join(
  repoRoot,
  '.cursor/scripts/i18n-authority-protection-classifier.harness.sh',
);
const GOVERNANCE_PARITY_BASE_SHA = '2f0d128da1ee966250da200a2a17f2a5e24f1a73';
const prGateCliPath = join(repoRoot, 'frontend/scripts/i18n-pr-gate.mjs');
const removedBootstrapScriptPath = join(repoRoot, '.github/scripts/i18n-pr-bootstrap-relevance.sh');

function scanFixture(fileName, relDir = 'i18n/__fixtures__/governance-adversarial') {
  const source = readFileSync(join(fixtureRoot, fileName), 'utf8');
  return scanSource(`${relDir}/${fileName}`, source, { includeEnhanced: true });
}

function compareSources(baseSource, headSource, relPath) {
  const baseFindings = baseSource
    ? scanSource(relPath, baseSource, { includeEnhanced: true })
    : [];
  const headFindings = headSource
    ? scanSource(relPath, headSource, { includeEnhanced: true })
    : [];
  return compareBaseAndHeadFindings({ baseFindings, headFindings, manifest });
}

function expectNewDebt(count, result) {
  expect(result.newPrActionableHostDebt, JSON.stringify(result.blockingFindings)).toBe(count);
}

function createTempGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'synq-i18n-pr-gate-'));
  const runGit = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  runGit(['init']);
  runGit(['config', 'user.email', 'test@example.com']);
  runGit(['config', 'user.name', 'Test']);
  return { dir, runGit };
}

function commitAll(runGit: (args: string[]) => string, message: string) {
  runGit(['add', '-A']);
  runGit(['commit', '-m', message]);
  return runGit(['rev-parse', 'HEAD']).trim();
}

function seedGovernanceManifest(repoDir: string) {
  mkdirSync(join(repoDir, 'frontend/src/i18n'), { recursive: true });
  writeFileSync(
    join(repoDir, 'frontend/src/i18n/i18n-debt-classifications.json'),
    readFileSync(manifestPath, 'utf8'),
  );
}

function gitChangedPaths(repoDir: string, baseSha: string, headSha: string) {
  const buffer = execFileSync(
    'git',
    ['diff', '--name-only', '-z', `${baseSha}...${headSha}`],
    { cwd: repoDir },
  );
  const paths: string[] = [];
  let start = 0;
  for (let i = 0; i <= buffer.length; i++) {
    if (i === buffer.length || buffer[i] === 0) {
      if (i > start) {
        paths.push(buffer.subarray(start, i).toString('utf8'));
      }
      start = i + 1;
    }
  }
  return paths;
}

function classifyWorkflowInlineRelevance(repoDir: string, baseSha: string, headSha: string) {
  return hasI18nRelevantChanges(gitChangedPaths(repoDir, baseSha, headSha));
}

function extractWorkflowBootstrapCasePatterns() {
  const workflowYaml = readFileSync(workflowPath, 'utf8');
  const caseMatch = workflowYaml.match(/case "\$path" in\s*\n\s+([^\n]+)\)\s*\n/);
  if (!caseMatch?.[1]) {
    throw new Error('Workflow bootstrap relevance case statement not found');
  }
  return caseMatch[1].split('|').map((pattern) => pattern.trim());
}

function workflowBootstrapRelevant(path: string) {
  const patterns = extractWorkflowBootstrapCasePatterns();
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      if (path.startsWith(prefix)) return true;
      continue;
    }
    if (pattern.endsWith('*.mjs')) {
      const prefix = pattern.slice(0, -5);
      if (path.startsWith(prefix) && path.endsWith('.mjs')) return true;
      continue;
    }
    if (path === pattern) return true;
  }
  return false;
}

function bootstrapRelevantFromPath(path: string) {
  return workflowBootstrapRelevant(path);
}

function defaultGateOptions(overrides: Record<string, unknown> = {}) {
  return {
    emitGithubAnnotations: false,
    ...overrides,
  };
}

function captureConsoleError<T>(run: () => T): { result: T; messages: string[] } {
  const messages: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  };
  try {
    const result = run();
    return { result, messages };
  } finally {
    console.error = originalError;
  }
}

function assertProtectedPathContract(path: string) {
  expect(workflowBootstrapRelevant(path), `${path} workflow bootstrap`).toBe(true);
  expect(isI18nRelevantPath(path), `${path} JS relevance`).toBe(true);
  expect(isGovernanceAuthorityPath(path), `${path} governance authority`).toBe(true);
  const partitions = partitionChangedPaths([path], isScannerEligibleRelativePath);
  expect(partitions.governedProductionPaths, `${path} product classification`).toEqual([]);
  expect(partitions.authorityPaths, `${path} authority classification`).toEqual([path]);
}

describe('P2.3.3 PR gate — parser and policy', () => {
  it('parses rename paths with spaces without whitespace splitting', () => {
    const buffer = 'R100\0frontend/src/old path/Foo Bar.tsx\0frontend/src/new path/Foo Bar.tsx\0';
    const entries = parseNameStatusZGit(buffer);
    expect(entries).toEqual([
      {
        status: 'R',
        similarity: 100,
        oldPath: 'frontend/src/old path/Foo Bar.tsx',
        newPath: 'frontend/src/new path/Foo Bar.tsx',
      },
    ]);
    const units = buildFileScanUnits(entries);
    expect(units[0]?.type).toBe('rename');
    expect(units[0]?.oldRepoPath).toContain('Foo Bar.tsx');
  });

  it('parses A/M/D/R/C status entries', () => {
    const buffer = [
      'A\0frontend/src/rental/New.tsx',
      'M\0frontend/src/rental/Edit.tsx',
      'D\0frontend/src/rental/Old.tsx',
      'R100\0frontend/src/rental/From.tsx\0frontend/src/rental/To.tsx',
      'C100\0frontend/src/rental/CopyFrom.tsx\0frontend/src/rental/CopyTo.tsx',
    ].join('\0');
    const entries = parseNameStatusZGit(`${buffer}\0`);
    expect(entries.map((e) => e.status)).toEqual(['A', 'M', 'D', 'R', 'C']);
  });

  it('fails closed on unknown git status', () => {
    expect(() => parseNameStatusZGit('Z\0frontend/src/rental/Bad.tsx\0')).toThrow(/Unknown git/);
  });

  it('fails closed on unsupported git status T/U/X/B', () => {
    expect(() => parseNameStatusZGit('T\0frontend/src/rental/Bad.tsx\0')).toThrow(/UNSUPPORTED_GIT_STATUS/);
    expect(() => parseNameStatusZGit('U\0frontend/src/rental/Bad.tsx\0')).toThrow(/UNSUPPORTED_GIT_STATUS/);
    expect(() => parseNameStatusZGit('X\0frontend/src/rental/Bad.tsx\0')).toThrow(/UNSUPPORTED_GIT_STATUS/);
    expect(() => parseNameStatusZGit('B\0frontend/src/rental/Bad.tsx\0')).toThrow(/UNSUPPORTED_GIT_STATUS/);
  });

  it('fails closed on malformed NUL stream', () => {
    expect(() => parseNameStatusZGit('M\0')).toThrow(/Malformed/);
    expect(() => parseNameStatusZGit('R100\0only-old-path\0')).toThrow(/Malformed/);
  });

  it('parses unicode paths without corruption', () => {
    const buffer = 'M\0frontend/src/rental/überführung/Änderung.tsx\0';
    const entries = parseNameStatusZGit(`${buffer}\0`);
    expect(entries[0]?.newPath).toBe('frontend/src/rental/überführung/Änderung.tsx');
  });

  it('flags mixed governance authority and product changes', () => {
    const result = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['frontend/scripts/i18n-pr-gate.mjs'],
      governedProductionPaths: ['frontend/src/rental/App.tsx'],
      authorityApproved: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE');
    expect(result.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
  });

  it('flags mixed package.json authority and product changes even when approved', () => {
    const result = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['frontend/package.json'],
      governedProductionPaths: ['frontend/src/rental/components/Foo.tsx'],
      authorityApproved: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE');
    expect(result.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
  });

  it('requires approval for package.json-only changes', () => {
    const unapproved = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['frontend/package.json'],
      governedProductionPaths: [],
      authorityApproved: false,
    });
    expect(unapproved.ok).toBe(false);
    expect(unapproved.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
    const approved = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['frontend/package.json'],
      governedProductionPaths: [],
      authorityApproved: true,
    });
    expect(approved.ok).toBe(true);
  });

  it('requires approval for i18n-check-only changes', () => {
    const unapproved = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['frontend/scripts/i18n-check.mjs'],
      governedProductionPaths: [],
      authorityApproved: false,
    });
    expect(unapproved.ok).toBe(false);
    expect(unapproved.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
  });

  it('requires approval for authority-only changes', () => {
    const unapproved = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['frontend/scripts/i18n-pr-gate.mjs'],
      governedProductionPaths: [],
      authorityApproved: false,
    });
    expect(unapproved.ok).toBe(false);
    const approved = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['frontend/scripts/i18n-pr-gate.mjs'],
      governedProductionPaths: [],
      authorityApproved: true,
    });
    expect(approved.ok).toBe(true);
  });

  it('detects ungoverned production source paths', () => {
    const partitions = partitionChangedPaths(
      ['frontend/src/experimental/OutsideRoots.tsx'],
      isScannerEligibleRelativePath,
    );
    expect(partitions.ungovernedProductionPaths).toEqual([
      'frontend/src/experimental/OutsideRoots.tsx',
    ]);
  });

  it('detects unsupported governed source extensions', () => {
    const partitions = partitionChangedPaths(
      ['frontend/src/rental/legacy.js'],
      isScannerEligibleRelativePath,
    );
    expect(partitions.unsupportedProductionPaths).toEqual(['frontend/src/rental/legacy.js']);
  });
});

describe('P2.3.3 PR gate — multiset lineage', () => {
  const relPath = 'rental/components/Example.tsx';
  const hostTitle = 'German tooltip text';
  const hostText = 'Bitte speichern';

  it('1 passes when no production findings change', () => {
    const result = compareSources(
      `export function Example() { return <div>{t('common.ok')}</div>; }`,
      `export function Example() { return <div>{t('common.ok')}</div>; }`,
      relPath,
    );
    expectNewDebt(0, result);
  });

  it('3 blocks new direct JSX host text', () => {
    const result = compareSources(
      `export function Example() { return <div>{t('common.ok')}</div>; }`,
      `export function Example() { return <div>${hostText}</div>; }`,
      relPath,
    );
    expectNewDebt(1, result);
  });

  it('4 blocks new title literal', () => {
    const result = compareSources(
      `export const x = null;`,
      `export function Example() { return <button title="${hostTitle}">x</button>; }`,
      relPath,
    );
    expectNewDebt(1, result);
  });

  it('5 blocks new aria-label literal', () => {
    const result = compareSources(
      `export const x = null;`,
      `export function Example() { return <input aria-label="Search vehicles" />; }`,
      relPath,
    );
    expectNewDebt(1, result);
  });

  it('6 blocks new placeholder literal', () => {
    const result = compareSources(
      `export const x = null;`,
      `export function Example() { return <input placeholder="Search vehicles" />; }`,
      relPath,
    );
    expectNewDebt(1, result);
  });

  it('7 blocks indirect title variable', () => {
    const result = compareFixtureDelta('GoodTranslatedPresentation.tsx', 'BadHomeAwayRegression.tsx');
    expectNewDebt(1, result);
  });

  it('8 blocks toast host copy', () => {
    const result = compareFixtureDelta(null, 'BadToastLiteral.tsx');
    expectNewDebt(1, result);
  });

  it('9 blocks setError host fallback', () => {
    const result = compareFixtureDelta(null, 'BadErrorFallback.tsx');
    expectNewDebt(1, result);
  });

  it('11 duplicate 1→2 blocks +1', () => {
    const base = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const head = `export function Example() {
      return (<><button title="${hostTitle}">A</button><button title="${hostTitle}">B</button></>);
    }`;
    expectNewDebt(1, compareSources(base, head, relPath));
  });

  it('12 duplicate 1→3 blocks +2', () => {
    const base = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const head = `export function Example() {
      return (<>
        <button title="${hostTitle}">A</button>
        <button title="${hostTitle}">B</button>
        <button title="${hostTitle}">C</button>
      </>);
    }`;
    expectNewDebt(2, compareSources(base, head, relPath));
  });

  it('13 duplicate inserted before original blocks +1', () => {
    const base = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const head = `export function Example() {
      return (<><button title="${hostTitle}">B</button><button title="${hostTitle}">A</button></>);
    }`;
    expectNewDebt(1, compareSources(base, head, relPath));
  });

  it('14 duplicate inserted after original blocks +1', () => {
    const base = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const head = `export function Example() {
      return (<><button title="${hostTitle}">A</button><button title="${hostTitle}">B</button></>);
    }`;
    expectNewDebt(1, compareSources(base, head, relPath));
  });

  it('15 blank-line shift passes with same occurrence count', () => {
    const base = `export function Example() {\n  return <button title="${hostTitle}">A</button>;\n}`;
    const head = `export function Example() {\n\n  return <button title="${hostTitle}">A</button>;\n\n}`;
    expectNewDebt(0, compareSources(base, head, relPath));
  });

  it('16 structural refactor passes with same lineage count', () => {
    const base = `function Inner() { return <button title="${hostTitle}">A</button>; }
export function Example() { return <Inner />; }`;
    const head = `function InnerRenamed() { return <button title="${hostTitle}">A</button>; }
export function Example() { return <InnerRenamed />; }`;
    expectNewDebt(0, compareSources(base, head, relPath));
  });

  it('17 pure rename passes when lineage counts match', () => {
    const source = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const baseFindings = scanSource('rental/components/OldPath.tsx', source, { includeEnhanced: true });
    const headFindings = scanSource('rental/components/NewPath.tsx', source, { includeEnhanced: true });
    const result = compareBaseAndHeadFindings({ baseFindings, headFindings, manifest });
    expectNewDebt(0, result);
  });

  it('18 rename plus one new occurrence blocks +1', () => {
    const baseSource = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const headSource = `export function Example() {
      return (<><button title="${hostTitle}">A</button><button title="${hostTitle}">B</button></>);
    }`;
    const result = compareBaseAndHeadFindings({
      baseFindings: scanSource('rental/components/OldPath.tsx', baseSource, { includeEnhanced: true }),
      headFindings: scanSource('rental/components/NewPath.tsx', headSource, { includeEnhanced: true }),
      manifest,
    });
    expectNewDebt(1, result);
  });

  it('19 copied file with host copy blocks', () => {
    const source = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const result = compareBaseAndHeadFindings({
      baseFindings: [],
      headFindings: scanSource('rental/components/CopyTarget.tsx', source, { includeEnhanced: true }),
      manifest,
    });
    expectNewDebt(1, result);
  });

  it('20 deletion passes', () => {
    const source = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const result = compareBaseAndHeadFindings({
      baseFindings: scanSource(relPath, source, { includeEnhanced: true }),
      headFindings: [],
      manifest,
    });
    expectNewDebt(0, result);
  });

  it('21 literal wording change blocks', () => {
    const result = compareSources(
      `export function Example() { return <button title="Save">A</button>; }`,
      `export function Example() { return <button title="Save vehicle">A</button>; }`,
      relPath,
    );
    expectNewDebt(1, result);
  });

  it('22 reintroduced historical fingerprint blocks with dedicated detector proof', () => {
    const rel = 'rental/components/BookingsView.tsx';
    const base = `export function Example() { return <div>{t('common.ok')}</div>; }`;
    const head = readFileSync(join(fixtureRoot, 'BadTitleLiteral.tsx'), 'utf8');
    const baseFindings = scanSource(rel, base, { includeEnhanced: true });
    const headFindings = scanSource(rel, head, { includeEnhanced: true });
    const fingerprint = headFindings[0]?.fingerprint;
    expect(fingerprint).toBeTruthy();
    expect(baseFindings.some((finding) => finding.fingerprint === fingerprint)).toBe(false);

    const frozenManifest = {
      ...manifest,
      baselineFingerprints: [fingerprint],
    };
    const result = compareBaseAndHeadFindings({
      baseFindings,
      headFindings,
      manifest: frozenManifest,
    });
    expect(result.reintroducedHistoricalDebt).toHaveLength(1);
    expect(result.reintroducedHistoricalDebt[0]?.fingerprint).toBe(fingerprint);
    const summary = buildGateSummary({
      baseSha: 'base',
      headSha: 'head',
      changedGovernedProductionFiles: 1,
      comparison: result,
      authority: {
        ok: true,
        exitCode: EXIT_CODES.PASS,
        governanceAuthorityChanged: false,
        mixedAuthorityProductChange: false,
        authorityApproved: true,
      },
    });
    expect(summary.reintroducedHistoricalDebt).toBe(1);
    expect(summary.pass).toBe(false);
  });

  it('23 unchanged preexisting residual in touched file passes', () => {
    const source = `export function Example() { return <button title="${hostTitle}">A</button>; }`;
    const result = compareSources(source, source, relPath);
    expectNewDebt(0, result);
    expect(result.unchangedPreexistingResidualDebt).toBeGreaterThanOrEqual(0);
  });

  it('24 new copy in Data Analyse blocks', () => {
    const rel = 'rental/components/DataAnalyse/FinancialInsightPanel.tsx';
    const result = compareSources(
      `export function Panel() { return null; }`,
      `export function Panel() { return <button>Neuer Bericht</button>; }`,
      rel,
    );
    expectNewDebt(1, result);
  });

  it('25 unchanged Data Analyse baseline debt passes', () => {
    const rel = 'rental/components/DataAnalyse/FinancialInsightPanel.tsx';
    const source = `export function Panel() { return <span>Legacy KPI</span>; }`;
    expectNewDebt(0, compareSources(source, source, rel));
  });

  it('26 new copy in IAM deferred file blocks', () => {
    const rel = 'rental/components/users-roles/RolesTab.tsx';
    const result = compareSources(
      `export function RolesTab() { return null; }`,
      `export function RolesTab() { return <button>Neue Rolle</button>; }`,
      rel,
    );
    expectNewDebt(1, result);
  });

  it('27 machine-domain finding passes', () => {
    const result = compareFixtureDelta(null, 'GoodMachineEnum.tsx');
    expectNewDebt(0, result);
  });

  it('28 raw provider/user values pass', () => {
    expectNewDebt(0, compareFixtureDelta(null, 'GoodProviderMessage.tsx'));
    expectNewDebt(0, compareFixtureDelta(null, 'GoodOrganizationName.tsx'));
  });

  it('29 Help Center shell copy blocks', () => {
    const rel = 'rental/components/HelpCenterView.tsx';
    const result = compareSources(
      `export function HelpCenterView() { return <section />; }`,
      `export function HelpCenterView() { return <button>Support kontaktieren</button>; }`,
      rel,
    );
    expectNewDebt(1, result);
  });

  it('30 genuine editorial content fails closed on enforce-clean Help Center shell', () => {
    const rel = 'rental/components/HelpCenterView.tsx';
    const result = compareSources(
      `export function HelpCenterView() { return <section />; }`,
      `export function HelpCenterView() { return <p>How to manage fleet reservations in SynqDrive.</p>; }`,
      rel,
    );
    expectNewDebt(1, result);
  });

  it('2 translated t() addition passes', () => {
    const result = compareFixtureDelta('GoodCssClass.tsx', 'GoodTranslatedPresentation.tsx');
    expectNewDebt(0, result);
  });

  it('36 deterministic second execution is identical', () => {
    const base = `export function Example() { return <button title="Speichern">A</button>; }`;
    const head = `export function Example() { return <button title="Speichern">A</button><button title="Neu">B</button>; }`;
    const first = compareSources(base, head, relPath);
    const second = compareSources(base, head, relPath);
    expect(first).toEqual(second);
  });

  it('PR-lineage key ignores file and structural context', () => {
    const findings = scanSource(
      relPath,
      `export function Example() { return <button title="${hostTitle}">A</button>; }`,
      { includeEnhanced: true },
    );
    expect(findings.length).toBeGreaterThan(0);
    const key = buildPrLineageKey(findings[0]);
    expect(key).not.toContain('Example.tsx');
    expect(key.toLowerCase()).toContain('german tooltip text');
  });

  it('multiset duplicate math is exact', () => {
    const base = buildFindingMultiset(
      scanSource(relPath, `export function Example() { return <button title="${hostTitle}">A</button>; }`, {
        includeEnhanced: true,
      }),
    );
    const head = buildFindingMultiset(
      scanSource(
        relPath,
        `export function Example() { return (<><button title="${hostTitle}">A</button><button title="${hostTitle}">B</button><button title="${hostTitle}">C</button></>); }`,
        { includeEnhanced: true },
      ),
    );
    const deltas = compareMultisetCounts(base, head);
    const delta = deltas.find((entry) => entry.newOccurrences > 0);
    expect(delta?.newOccurrences).toBe(2);
  });
});

function compareFixtureDelta(baseFixture, headFixture) {
  const rel = 'i18n/__fixtures__/governance-adversarial/Target.tsx';
  const baseSource = baseFixture ? readFileSync(join(fixtureRoot, baseFixture), 'utf8') : `export const x = null;`;
  const headSource = readFileSync(join(fixtureRoot, headFixture), 'utf8');
  return compareSources(baseSource, headSource, rel);
}

describe('P2.3.3 PR gate — protected-path contract parity', () => {
  const protectedPrefixSamples = [
    'frontend/scripts/i18n-pr-gate.mjs',
    'frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs',
  ];

  it.each(PROTECTED_GOVERNANCE_EXACT_PATHS)(
    'exact protected path %s is workflow-relevant, JS-relevant, and authority-only',
    (path) => {
      assertProtectedPathContract(path);
    },
  );

  it.each(protectedPrefixSamples)(
    'protected prefix sample %s is workflow-relevant, JS-relevant, and authority-only',
    (path) => {
      assertProtectedPathContract(path);
    },
  );

  it('workflow bootstrap case patterns include every canonical exact protected path', () => {
    const patterns = extractWorkflowBootstrapCasePatterns();
    const patternLine = patterns.join('|');
    for (const path of PROTECTED_GOVERNANCE_EXACT_PATHS) {
      expect(patternLine, `missing workflow bootstrap path ${path}`).toContain(path);
    }
    expect(patternLine).toContain('frontend/src/*');
    expect(patternLine).toContain('frontend/scripts/i18n-*.mjs');
    expect(patternLine).toContain('frontend/scripts/lib/i18n-governance/*');
  });

  it('workflow bootstrap patterns stay aligned with canonical JS contract', () => {
    const samples = [
      ...PROTECTED_GOVERNANCE_EXACT_PATHS,
      ...protectedPrefixSamples,
      'frontend/src/rental/components/Foo.tsx',
      'backend/src/modules/example/example.service.ts',
      'docs/readme.md',
    ];
    for (const path of samples) {
      expect(workflowBootstrapRelevant(path)).toBe(isI18nRelevantPath(path));
    }
  });

  it('.cursor/rules/i18n.mdc only is never irrelevant', () => {
    assertProtectedPathContract('.cursor/rules/i18n.mdc');
    const policy = evaluateGovernanceAuthorityPolicy({
      authorityPaths: ['.cursor/rules/i18n.mdc'],
      governedProductionPaths: [],
      authorityApproved: false,
    });
    expect(policy.ok).toBe(false);
    expect(policy.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
  });

  it('AGENTS.md only is never irrelevant', () => {
    assertProtectedPathContract('AGENTS.md');
  });

  it('workflow file only is never irrelevant', () => {
    assertProtectedPathContract('.github/workflows/i18n-governance-new-debt.yml');
  });

  it('inventory only is authority without product classification', () => {
    assertProtectedPathContract('frontend/src/i18n/hardcoded-copy-inventory.json');
  });

  it('coverage baseline only is authority without product classification', () => {
    assertProtectedPathContract('frontend/src/i18n/translation-coverage-baseline.json');
  });

  it('coverage module only is authority without product classification', () => {
    assertProtectedPathContract('frontend/src/i18n/translation-coverage.ts');
  });

  it('coverage test only is authority without product classification', () => {
    assertProtectedPathContract('frontend/src/i18n/translation-coverage.test.ts');
  });

  it('debt manifest only is authority without product classification', () => {
    assertProtectedPathContract('frontend/src/i18n/i18n-debt-classifications.json');
  });

  it('governance script only is authority without product classification', () => {
    assertProtectedPathContract('frontend/scripts/i18n-pr-gate.mjs');
  });

  it('governance library only is authority without product classification', () => {
    assertProtectedPathContract('frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs');
  });

  const namedGovernanceTests = [
    'frontend/src/i18n/i18n-governance-scanner.test.ts',
    'frontend/src/i18n/i18n-pr-gate.test.ts',
    'frontend/src/i18n/i18n-structural-check.test.ts',
    'frontend/src/i18n/hardcoded-copy-guard.test.ts',
    'frontend/src/i18n/locales.test.ts',
    'frontend/src/i18n/translation-registry.test.ts',
  ];

  it.each(namedGovernanceTests)('named governance test %s is authority-only', (path) => {
    assertProtectedPathContract(path);
  });

  const launderingAuthorityPaths = [
    'frontend/src/i18n/hardcoded-copy-inventory.json',
    'frontend/src/i18n/translation-coverage-baseline.json',
    'frontend/src/i18n/translation-coverage.ts',
    'frontend/src/i18n/i18n-debt-classifications.json',
  ];

  it.each(launderingAuthorityPaths)(
    'product plus %s fails mixed laundering even when approved',
    (authorityPath) => {
      const result = evaluateGovernanceAuthorityPolicy({
        authorityPaths: [authorityPath],
        governedProductionPaths: ['frontend/src/rental/components/Foo.tsx'],
        authorityApproved: true,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE');
      expect(result.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
    },
  );

  it.each(launderingAuthorityPaths)(
    'product plus %s fails mixed laundering without approval',
    (authorityPath) => {
      const result = evaluateGovernanceAuthorityPolicy({
        authorityPaths: [authorityPath],
        governedProductionPaths: ['frontend/src/rental/components/Foo.tsx'],
        authorityApproved: false,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE');
    },
  );
});

describe('P2.3.2 authority protection — extracted workflow classifier harness', () => {
  it('executes the trusted workflow run script with mocked GitHub API responses', () => {
    const harnessTemp = mkdtempSync(join(tmpdir(), 'i18n-authority-classifier-harness-'));
    const result = spawnSync('bash', [authorityProtectionClassifierHarnessPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: harnessTemp,
      },
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Harness complete:');
    expect(result.stdout).toMatch(/9\/9 tests passed/);
    expect(result.stdout).toContain('PR #1581 authority paths + trusted owner label pass');
    expect(result.stdout).toContain('mixed authority + product change fails even with trusted owner approval');
    expect(result.stdout).toContain('negative control: broken workflow incorrectly approves mixed change');
  });
});

describe('P2.3.3 PR gate — workflow-inline trusted bootstrap relevance', { timeout: 60000 }, () => {
  it('bootstrap contract stays aligned with canonical JS relevance policy', () => {
    const samples = [
      'backend/src/modules/example/example.service.ts',
      'frontend/src/rental/components/Foo.tsx',
      'frontend/scripts/i18n-pr-gate.mjs',
      'frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs',
      'frontend/package.json',
      'frontend/package-lock.json',
      '.github/workflows/i18n-governance-new-debt.yml',
      '.cursor/rules/i18n.mdc',
      'AGENTS.md',
      'docs/readme.md',
    ];
    for (const path of samples) {
      expect(isI18nRelevantPath(path)).toBe(bootstrapRelevantFromPath(path));
    }
  });

  it('external bootstrap script is absent from repository tree', () => {
    expect(existsSync(removedBootstrapScriptPath)).toBe(false);
  });

  it('workflow does not reference external bootstrap script', () => {
    const workflowYaml = readFileSync(workflowPath, 'utf8');
    expect(workflowYaml).not.toContain('i18n-pr-bootstrap-relevance.sh');
    expect(workflowYaml).not.toMatch(/bash\s+\.github\/scripts\//);
  });

  it('workflow relevance step does not execute PR-head repository executables before relevance output', () => {
    const workflowYaml = readFileSync(workflowPath, 'utf8');
    const relevanceMatch = workflowYaml.match(
      /Classify PR relevance[\s\S]*?run:\s*\|\s*([\s\S]*?)(?=\n\s{6}-\sname:)/,
    );
    expect(relevanceMatch).not.toBeNull();
    const relevanceStep = relevanceMatch?.[1] ?? '';
    expect(relevanceStep).not.toMatch(/node\s+scripts\/i18n-pr-gate/);
    expect(relevanceStep).not.toMatch(/bash\s+\.github\/scripts\//);
    expect(relevanceStep).not.toMatch(/source\s+\.github\//);
    expect(relevanceStep).not.toMatch(/\bnpm\b/);
    expect(relevanceStep).not.toMatch(/done\s*<\s*<\s*\(\s*git diff/);
    expect(relevanceStep).toContain('git diff --name-only -z');
    expect(relevanceStep).toContain('RUNNER_TEMP');
    expect(relevanceStep).toContain('GITHUB_OUTPUT');
  });

  it('workflow runs PR-gate adversarial tests on relevant path before final gate', () => {
    const workflowYaml = readFileSync(workflowPath, 'utf8');
    const prGateTestIndex = workflowYaml.indexOf('i18n:pr-gate:test');
    const finalGateIndex = workflowYaml.indexOf('npm run i18n:pr-gate --');
    expect(prGateTestIndex).toBeGreaterThan(-1);
    expect(finalGateIndex).toBeGreaterThan(prGateTestIndex);
  });

  it('backend-only real git repo classifies as irrelevant via workflow-inline contract', () => {
    const { dir, runGit } = createTempGitRepo();
    writeFileSync(join(dir, 'README.md'), 'seed\n');
    const baseSha = commitAll(runGit, 'base');
    mkdirSync(join(dir, 'backend/src/modules/example'), { recursive: true });
    writeFileSync(
      join(dir, 'backend/src/modules/example/example.service.ts'),
      'export class ExampleService {}\n',
    );
    const headSha = commitAll(runGit, 'head');
    expect(classifyWorkflowInlineRelevance(dir, baseSha, headSha)).toBe(false);
  });

  it('frontend-only real git repo classifies as relevant via workflow-inline contract', () => {
    const { dir, runGit } = createTempGitRepo();
    writeFileSync(join(dir, 'README.md'), 'seed\n');
    const baseSha = commitAll(runGit, 'base');
    mkdirSync(join(dir, 'frontend/src/rental/components'), { recursive: true });
    writeFileSync(join(dir, 'frontend/src/rental/components/Foo.tsx'), 'export const Foo = null;\n');
    const headSha = commitAll(runGit, 'head');
    expect(classifyWorkflowInlineRelevance(dir, baseSha, headSha)).toBe(true);
  });

  it('malicious i18n-pr-gate relevance bypass cannot force workflow-inline no-op', () => {
    const { dir, runGit } = createTempGitRepo();
    mkdirSync(join(dir, 'frontend/scripts'), { recursive: true });
    writeFileSync(join(dir, 'frontend/scripts/i18n-pr-gate.mjs'), 'export const ok = true;\n');
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      join(dir, 'frontend/scripts/i18n-pr-gate.mjs'),
      'console.log("I18N_RELEVANT_CHANGES=NO");\nexport const ok = false;\n',
    );
    const headSha = commitAll(runGit, 'malicious');
    expect(classifyWorkflowInlineRelevance(dir, baseSha, headSha)).toBe(true);
  });

  it('malicious pr-gate-policy change still classifies as relevant via workflow-inline contract', () => {
    const { dir, runGit } = createTempGitRepo();
    mkdirSync(join(dir, 'frontend/scripts/lib/i18n-governance'), { recursive: true });
    writeFileSync(
      join(dir, 'frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs'),
      'export const ok = true;\n',
    );
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      join(dir, 'frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs'),
      'export function hasI18nRelevantChanges() { return false; }\n',
    );
    const headSha = commitAll(runGit, 'malicious-policy');
    expect(classifyWorkflowInlineRelevance(dir, baseSha, headSha)).toBe(true);
  });

  it('workflow self-change classifies as relevant via workflow-inline contract', () => {
    const { dir, runGit } = createTempGitRepo();
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(join(dir, '.github/workflows/i18n-governance-new-debt.yml'), 'name: seed\n');
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(join(dir, '.github/workflows/i18n-governance-new-debt.yml'), 'name: changed\n');
    const headSha = commitAll(runGit, 'workflow');
    expect(classifyWorkflowInlineRelevance(dir, baseSha, headSha)).toBe(true);
  });

  it('expanded governance authority paths include package.json, i18n-check, and control-plane tests', () => {
    expect(GOVERNANCE_AUTHORITY_PREFIXES).toContain('frontend/package.json');
    expect(GOVERNANCE_AUTHORITY_PREFIXES).toContain('.cursor/rules/i18n.mdc');
    expect(GOVERNANCE_AUTHORITY_PREFIXES).toContain('AGENTS.md');
    expect(isGovernanceAuthorityPath('frontend/scripts/i18n-check.mjs')).toBe(true);
    expect(GOVERNANCE_AUTHORITY_PREFIXES).toContain('frontend/src/i18n/i18n-pr-gate.test.ts');
    expect(GOVERNANCE_AUTHORITY_PREFIXES).toContain('frontend/src/i18n/i18n-governance-scanner.test.ts');
    expect(GOVERNANCE_AUTHORITY_PREFIXES).toContain('frontend/src/i18n/translation-registry.test.ts');
    expect(BOOTSTRAP_RELEVANT_PATH_CONTRACT.exact).toEqual(PROTECTED_GOVERNANCE_EXACT_PATHS);
    expect(BOOTSTRAP_RELEVANT_PATH_CONTRACT.prefixes).toEqual([
      'frontend/src/',
      ...PROTECTED_GOVERNANCE_PREFIXES,
    ]);
    expect(partitionChangedPaths(['frontend/package.json'], isScannerEligibleRelativePath).authorityPaths).toEqual([
      'frontend/package.json',
    ]);
    expect(
      partitionChangedPaths(['frontend/scripts/i18n-check.mjs'], isScannerEligibleRelativePath).authorityPaths,
    ).toEqual(['frontend/scripts/i18n-check.mjs']);
  });
});

describe('P2.3.3 PR gate — git source read fail-closed', () => {
  it('readSourceAtRef throws GIT_SOURCE_READ_FAILURE when must-exist source is missing', { timeout: 15000 }, () => {
    const { dir, runGit } = createTempGitRepo();
    mkdirSync(join(dir, 'frontend/src/rental/components'), { recursive: true });
    writeFileSync(
      join(dir, 'frontend/src/rental/components/Clean.tsx'),
      `export function Clean() { return <div>{t('common.ok')}</div>; }`,
    );
    const baseSha = commitAll(runGit, 'base');
    expect(() =>
      readSourceAtRef(gitExec, dir, baseSha, 'frontend/src/rental/components/Missing.tsx', {
        mustExist: true,
      }),
    ).toThrow(GitSourceReadFailureError);
  });

  it('runGate surfaces GIT_SOURCE_READ_FAILURE with exit 5', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const relDir = join(dir, 'frontend/src/rental/components');
    mkdirSync(relDir, { recursive: true });
    const filePath = join(relDir, 'Widget.tsx');
    writeFileSync(filePath, `export function Widget() { return <div>{t('common.ok')}</div>; }`);
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      filePath,
      `export function Widget() { return <button title="Bitte speichern">Save</button>; }`,
    );
    const headSha = commitAll(runGit, 'head');
    const previous = process.env.I18N_PR_GATE_TEST_FORCE_READ_FAIL;
    process.env.I18N_PR_GATE_TEST_FORCE_READ_FAIL = 'frontend/src/rental/components/Widget.tsx';
    try {
      expect(() =>
        runGate(
          defaultGateOptions({
            baseSha,
            headSha,
            authorityApproved: false,
            repoRoot: dir,
            manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
          }),
        ),
      ).toThrow(GitSourceReadFailureError);
    } finally {
      if (previous === undefined) delete process.env.I18N_PR_GATE_TEST_FORCE_READ_FAIL;
      else process.env.I18N_PR_GATE_TEST_FORCE_READ_FAIL = previous;
    }
  });

  it('CLI maps GIT_SOURCE_READ_FAILURE to exit 5', { timeout: 15000 }, () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const relDir = join(dir, 'frontend/src/rental/components');
    mkdirSync(relDir, { recursive: true });
    const filePath = join(relDir, 'Widget.tsx');
    writeFileSync(filePath, `export function Widget() { return <div>{t('common.ok')}</div>; }`);
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      filePath,
      `export function Widget() { return <button title="Bitte speichern">Save</button>; }`,
    );
    const headSha = commitAll(runGit, 'head');
    const result = spawnSync(
      process.execPath,
      [
        prGateCliPath,
        '--base-sha',
        baseSha,
        '--head-sha',
        headSha,
        '--repo-root',
        dir,
        '--manifest-path',
        join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          I18N_PR_GATE_TEST_FORCE_READ_FAIL: 'frontend/src/rental/components/Widget.tsx',
        },
      },
    );
    expect(result.status).toBe(EXIT_CODES.INVALID_BASE_OR_GIT);
    expect(result.stderr).toContain('I18N_PR_GATE=FAIL');
    expect(result.stderr).toContain('I18N_PR_GATE_REASON=GIT_SOURCE_READ_FAILURE');
  });
});

describe('P2.3.3 PR gate — real git integration', { timeout: 60000 }, () => {
  it('hardcoded host addition in temp repo fails gate', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const relDir = join(dir, 'frontend/src/rental/components');
    mkdirSync(relDir, { recursive: true });
    const filePath = join(relDir, 'Widget.tsx');
    writeFileSync(
      filePath,
      `export function Widget() { return <div>{t('common.ok')}</div>; }`,
    );
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      filePath,
      `export function Widget() { return <button title="Speichern">Bitte speichern</button>; }`,
    );
    const headSha = commitAll(runGit, 'head');
    const summary = runGate(
      defaultGateOptions({
        baseSha,
        headSha,
        authorityApproved: false,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      }),
    );
    expect(summary.newPrActionableHostDebt).toBe(1);
    expect(summary.pass).toBe(false);
    expect(summary.exitCode).toBe(EXIT_CODES.NEW_ACTIONABLE_HOST_DEBT);
  });

  it('translated presentation addition in temp repo passes gate', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const relDir = join(dir, 'frontend/src/rental/components');
    mkdirSync(relDir, { recursive: true });
    const filePath = join(relDir, 'Widget.tsx');
    writeFileSync(filePath, `export function Widget() { return null; }`);
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      filePath,
      readFileSync(join(fixtureRoot, 'GoodTranslatedPresentation.tsx'), 'utf8'),
    );
    const headSha = commitAll(runGit, 'head');
    const summary = runGate(
      defaultGateOptions({
        baseSha,
        headSha,
        authorityApproved: false,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      }),
    );
    expect(summary.newPrActionableHostDebt).toBe(0);
    expect(summary.pass).toBe(true);
  });

  it('rename with spaces preserves lineage and passes without new debt', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const oldDir = join(dir, 'frontend/src/rental/components/old path');
    const newDir = join(dir, 'frontend/src/rental/components/new path');
    mkdirSync(oldDir, { recursive: true });
    const oldPath = join(oldDir, 'Foo Bar.tsx');
    writeFileSync(
      oldPath,
      `export function FooBar() { return <button title="German tooltip text">A</button>; }`,
    );
    const baseSha = commitAll(runGit, 'base');
    mkdirSync(newDir, { recursive: true });
    const newPath = join(newDir, 'Foo Bar.tsx');
    runGit(['mv', oldPath, newPath]);
    const headSha = commitAll(runGit, 'rename');
    const summary = runGate(
      defaultGateOptions({
        baseSha,
        headSha,
        authorityApproved: false,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      }),
    );
    expect(summary.newPrActionableHostDebt).toBe(0);
    expect(summary.pass).toBe(true);
  });

  it('real rename with spaces plus one host occurrence in one commit fails +1', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const oldDir = join(dir, 'frontend/src/rental/components/old path');
    mkdirSync(oldDir, { recursive: true });
    const oldPath = join(oldDir, 'Foo Bar.tsx');
    writeFileSync(
      oldPath,
      `/** Rental widget fixture with stable boilerplate for rename lineage tests. */
const CONFIG = { mode: 'rental', surface: 'operator', version: 3, padding: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
export function FooBar() {
  return <button title="German tooltip text">A</button>;
}
`,
    );
    const baseSha = commitAll(runGit, 'base');
    const newDir = join(dir, 'frontend/src/rental/components/new path');
    mkdirSync(newDir, { recursive: true });
    const newPath = join(newDir, 'Foo Bar.tsx');
    runGit(['mv', oldPath, newPath]);
    writeFileSync(
      newPath,
      `/** Rental widget fixture with stable boilerplate for rename lineage tests. */
const CONFIG = { mode: 'rental', surface: 'operator', version: 3, padding: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
export function FooBar() {
  return (<><button title="German tooltip text">A</button><button title="German tooltip text">B</button></>);
}
`,
    );
    const headSha = commitAll(runGit, 'rename-plus-one');
    const diffBuffer = execFileSync(
      'git',
      ['diff', '--name-status', '-z', '-M', `${baseSha}...${headSha}`],
      { cwd: dir },
    );
    const diffEntries = parseNameStatusZGit(diffBuffer);
    expect(diffEntries.some((entry) => entry.status === 'R')).toBe(true);
    const summary = runGate(
      defaultGateOptions({
        baseSha,
        headSha,
        authorityApproved: false,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      }),
    );
    expect(summary.newPrActionableHostDebt).toBe(1);
    expect(summary.pass).toBe(false);
    expect(summary.exitCode).toBe(EXIT_CODES.NEW_ACTIONABLE_HOST_DEBT);
  });
});

describe('P2.3.3 PR gate — repository integration', { timeout: 60000 }, () => {
  function seedAuthorityOnlyRepo() {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    mkdirSync(join(dir, 'frontend/scripts'), { recursive: true });
    writeFileSync(join(dir, 'frontend/scripts/i18n-check.mjs'), 'export const version = 1;\n');
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(join(dir, 'frontend/scripts/i18n-check.mjs'), 'export const version = 2;\n');
    const headSha = commitAll(runGit, 'authority-only');
    return { dir, baseSha, headSha };
  }

  it('authority-only change with approval passes', () => {
    const { dir, baseSha, headSha } = seedAuthorityOnlyRepo();
    const summary = runGate(
      defaultGateOptions({
        baseSha,
        headSha,
        authorityApproved: true,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      }),
    );
    expect(summary.pass).toBe(true);
    expect(summary.newPrActionableHostDebt).toBe(0);
    expect(summary.reintroducedHistoricalDebt).toBe(0);
    expect(summary.governanceAuthorityChanged).toBe('YES');
    expect(summary.mixedAuthorityProductChange).toBe('NO');
    expect(summary.changedGovernedProductionFiles).toBe(0);
  });

  it('authority-only change without approval fails with exit 3', () => {
    const { dir, baseSha, headSha } = seedAuthorityOnlyRepo();
    const summary = runGate(
      defaultGateOptions({
        baseSha,
        headSha,
        authorityApproved: false,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      }),
    );
    expect(summary.pass).toBe(false);
    expect(summary.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
    expect(summary.governanceAuthorityChanged).toBe('YES');
  });

  it('backend-only change produces the intended no-op', () => {
    const { dir, runGit } = createTempGitRepo();
    writeFileSync(join(dir, 'README.md'), 'seed\n');
    const baseSha = commitAll(runGit, 'base');
    mkdirSync(join(dir, 'backend/src/modules/example'), { recursive: true });
    writeFileSync(
      join(dir, 'backend/src/modules/example/example.service.ts'),
      'export class ExampleService {}\n',
    );
    const headSha = commitAll(runGit, 'backend-only');
    expect(classifyWorkflowInlineRelevance(dir, baseSha, headSha)).toBe(false);
    seedGovernanceManifest(dir);
    const noOp = runGate(
      defaultGateOptions({
        baseSha,
        headSha,
        authorityApproved: false,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
      }),
    );
    expect(noOp.pass).toBe(true);
    expect(noOp.noOp).toBe(true);
  });

  it('controlled new hardcoded host literal fails', () => {
    const relPath = 'rental/components/__pr_gate_red__.tsx';
    const result = compareSources(
      `export function Red() { return null; }`,
      `export function Red() { return <button title="German tooltip text">Save</button>; }`,
      relPath,
    );
    expectNewDebt(1, result);
  });

  it('controlled translated presentation passes', () => {
    const result = compareFixtureDelta(null, 'GoodTranslatedPresentation.tsx');
    expectNewDebt(0, result);
  });
});

describe('P2.3.3 PR gate — GitHub annotation emission', () => {
  it('synthetic test execution emits no GitHub workflow annotation command', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const relDir = join(dir, 'frontend/src/rental/components');
    mkdirSync(relDir, { recursive: true });
    const filePath = join(relDir, 'Widget.tsx');
    writeFileSync(filePath, `export function Widget() { return <div>{t('common.ok')}</div>; }`);
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      filePath,
      `export function Widget() { return <button title="Speichern">Bitte speichern</button>; }`,
    );
    const headSha = commitAll(runGit, 'head');

    const { messages } = captureConsoleError(() =>
      runGate(
        defaultGateOptions({
          baseSha,
          headSha,
          authorityApproved: false,
          repoRoot: dir,
          manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
        }),
      ),
    );

    const stderr = messages.join('\n');
    expect(stderr).not.toMatch(/^::error /m);
    expect(stderr).not.toContain('::error file=frontend/src/rental/components/Widget.tsx');
  });

  it('production-mode execution can still emit a real annotation', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const relDir = join(dir, 'frontend/src/rental/components');
    mkdirSync(relDir, { recursive: true });
    const filePath = join(relDir, 'Widget.tsx');
    writeFileSync(filePath, `export function Widget() { return <div>{t('common.ok')}</div>; }`);
    const baseSha = commitAll(runGit, 'base');
    writeFileSync(
      filePath,
      `export function Widget() { return <button title="Speichern">Bitte speichern</button>; }`,
    );
    const headSha = commitAll(runGit, 'head');

    const { messages } = captureConsoleError(() =>
      runGate({
        baseSha,
        headSha,
        authorityApproved: false,
        repoRoot: dir,
        manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
        emitGithubAnnotations: true,
      }),
    );

    const stderr = messages.join('\n');
    expect(stderr).toContain('::error file=frontend/src/rental/components/Widget.tsx');

    const gateSource = readFileSync(prGateCliPath, 'utf8');
    expect(gateSource).toContain('function shouldEmitGithubAnnotations');
    expect(gateSource).toMatch(/if \(emitAnnotations\) \{\s*\n\s*emitGithubAnnotation/);
  });
});

describe('P2.3.4 authority path contract — parsed workflow structural parity', () => {
  function gitShowAtRef(ref: string, path: string) {
    return execFileSync('git', ['show', `${ref}:${path}`], { cwd: repoRoot, encoding: 'utf8' });
  }

  function effectiveDiffPaths(baseSha: string) {
    return execFileSync('git', ['diff', '--name-only', baseSha], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  it('extracts authority case patterns from actual workflow YAML (no handwritten mirror)', () => {
    const workflowYaml = readFileSync(authorityProtectionWorkflowPath, 'utf8');
    const patterns = extractIsAuthorityPathCasePatterns(workflowYaml);
    expect(patterns).toContain('frontend/scripts/i18n-*.mjs');
    expect(patterns).toContain('.github/workflows/*');
    expect(patterns).not.toContain('frontend/scripts/i18n-check.mjs');
  });

  it('parsed workflow structurally covers canonical exact paths and prefix rules', () => {
    const contract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    const analysis = analyzeParsedWorkflowCanonicalParity(contract);
    expect(analysis.canonicalOnly, JSON.stringify(analysis.canonicalOnly)).toEqual([]);
    expect(analysis.unexplainedWorkflowExact, JSON.stringify(analysis.unexplainedWorkflowExact)).toEqual(
      [],
    );
    expect(analysis.prefixMismatches, JSON.stringify(analysis.prefixMismatches)).toEqual([]);
  });

  it('synthetic boundary witness matrix matches canonical and parsed workflow semantics', () => {
    const contract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    const witnesses = evaluateSyntheticBoundaryWitnesses(contract);
    const failures = witnesses.filter((entry) => !entry.ok);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it('frontend/scripts/i18n-future-check.mjs agrees across canonical and parsed workflow', () => {
    const contract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    const path = 'frontend/scripts/i18n-future-check.mjs';
    expect(isCanonicalGovernanceAuthorityPath(path)).toBe(true);
    expect(isParsedWorkflowAuthorityPath(path, contract)).toBe(true);
    expect(isParsedWorkflowProductOrPresentationPath(path, contract)).toBe(false);
  });

  it('documents intentional .github/workflows/* workflow-only expansion', () => {
    const contract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    const path = '.github/workflows/future-workflow.yml';
    expect(isCanonicalGovernanceAuthorityPath(path)).toBe(false);
    expect(isParsedWorkflowAuthorityPath(path, contract)).toBe(true);
    const parity = analyzeExpectedVsParsedWorkflowParity(contract, [path]);
    expect(parity.workflowOnly).toEqual([path]);
    expect(parity.canonicalOnly).toEqual([]);
    expect(parity.semanticDifferences).toEqual([]);
    expect(TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES[0]?.id).toBe('all-github-workflows');
  });

  it('mutation: unsupported workflow wildcard syntax fails contract validation closed', () => {
    const workflowYaml = readFileSync(authorityProtectionWorkflowPath, 'utf8');
    const mutated = mutateWorkflowYamlInsertUnsupportedPattern(workflowYaml);
    const contract = parseWorkflowAuthorityContract(mutated);
    expect(contract.ok).toBe(false);
    expect(contract.unsupportedPatterns.length).toBeGreaterThan(0);
    expect(() => assertWorkflowAuthorityContractValid(contract)).toThrow(
      /Unsupported workflow authority patterns/,
    );
  });

  it('mutation: authority case arm return 0 -> return 1 fails parity semantics', () => {
    const workflowYaml = readFileSync(authorityProtectionWorkflowPath, 'utf8');
    const mutatedYaml = mutateWorkflowYamlInvertAuthorityReturn(workflowYaml);
    const mutatedContract = parseWorkflowAuthorityContract(mutatedYaml);
    assertWorkflowAuthorityContractValid(mutatedContract);
    expect(
      isParsedWorkflowAuthorityPath('frontend/scripts/i18n-future-check.mjs', mutatedContract),
    ).toBe(false);

    const invertedContract = mutateWorkflowContractInvertAuthorityReturn(
      loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath),
    );
    const analysis = analyzeParsedWorkflowCanonicalParity(invertedContract);
    expect(analysis.prefixMismatches.length).toBeGreaterThan(0);
  });

  it('mutation: finite i18n script list breaks prefix semantics for future scripts', () => {
    const patterns = loadParsedWorkflowAuthorityPatterns(authorityProtectionWorkflowPath);
    const stale = mutatePatternsReplaceWildcardWithExactList(patterns);
    expect(isParsedWorkflowAuthorityPath('frontend/scripts/i18n-future-check.mjs', stale)).toBe(
      false,
    );
    const analysis = analyzeParsedWorkflowCanonicalParity(stale);
    expect(analysis.prefixMismatches.length).toBeGreaterThan(0);
  });

  it('mutation: broadened frontend/scripts/i18n-* wildcard fails synthetic .ts witness', () => {
    const contract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    const broadened = {
      ...contract,
      authorityPatterns: mutatePatternsBroadenI18nScriptWildcard(contract.authorityPatterns),
    };
    expect(isParsedWorkflowAuthorityPath('frontend/scripts/i18n-future-check.ts', broadened)).toBe(
      true,
    );
    const witnesses = evaluateSyntheticBoundaryWitnesses(broadened);
    const tsWitness = witnesses.find((entry) => entry.path === 'frontend/scripts/i18n-future-check.ts');
    expect(tsWitness?.ok).toBe(false);
  });

  it('mutation: removing a canonical exact path from parsed patterns is detected', () => {
    const patterns = loadParsedWorkflowAuthorityPatterns(authorityProtectionWorkflowPath);
    const stale = patterns.filter(
      (pattern) => !pattern.includes('translation-coverage-baseline.json'),
    );
    const analysis = analyzeParsedWorkflowCanonicalParity(stale);
    expect(analysis.canonicalOnly).toContain('frontend/src/i18n/translation-coverage-baseline.json');
  });

  it('pr-gate-policy delegates to canonical contract for all exact paths', () => {
    for (const path of CANONICAL_GOVERNANCE_EXACT_PATHS) {
      expect(isGovernanceAuthorityPath(path)).toBe(isCanonicalGovernanceAuthorityPath(path));
    }
  });

  it('prefix rule accepts only .mjs under frontend/scripts/i18n-', () => {
    const rule = CANONICAL_GOVERNANCE_PREFIX_RULES.find(
      (entry) => entry.prefix === 'frontend/scripts/i18n-',
    );
    expect(rule).toBeDefined();
    const contract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    expect(isCanonicalGovernanceAuthorityPath('frontend/scripts/i18n-check.mjs')).toBe(true);
    expect(isParsedWorkflowAuthorityPath('frontend/scripts/i18n-check.mjs', contract)).toBe(true);
    expect(isCanonicalGovernanceAuthorityPath('frontend/scripts/i18n-check.ts')).toBe(false);
    expect(isParsedWorkflowAuthorityPath('frontend/scripts/i18n-check.ts', contract)).toBe(false);
  });

  it('workflow YAML satisfies pull_request_target security invariants', () => {
    const workflowYaml = readFileSync(authorityProtectionWorkflowPath, 'utf8');
    assertWorkflowYamlSecurityInvariants(workflowYaml);
    expect(workflowYaml).not.toMatch(/uses:\s*actions\/checkout/);
  });

  it('PR effective diff is bootstrap-safe under BASE trusted classifier (2f0d128d)', () => {
    const baseWorkflowYaml = gitShowAtRef(
      GOVERNANCE_PARITY_BASE_SHA,
      '.github/workflows/i18n-authority-protection.yml',
    );
    const baseContract = loadParsedWorkflowAuthorityContract(baseWorkflowYaml);
    const diffPaths = effectiveDiffPaths(GOVERNANCE_PARITY_BASE_SHA);
    expect(diffPaths.length).toBeGreaterThan(0);
    const bootstrap = evaluateBootstrapSafety(baseContract, diffPaths);
    expect(bootstrap.authorityChanged).toBe(true);
    expect(bootstrap.productOrPresentationChanged).toBe(false);
    expect(bootstrap.productPaths, JSON.stringify(bootstrap.productPaths)).toEqual([]);
    expect(bootstrap.unrecognizedPaths, JSON.stringify(bootstrap.unrecognizedPaths)).toEqual([]);
    expect(bootstrap.ok).toBe(true);
  });

  it('PR effective diff is authority-only under corrected HEAD trusted classifier', () => {
    const headContract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    const diffPaths = effectiveDiffPaths(GOVERNANCE_PARITY_BASE_SHA);
    const bootstrap = evaluateBootstrapSafety(headContract, diffPaths);
    expect(bootstrap.authorityChanged).toBe(true);
    expect(bootstrap.productOrPresentationChanged).toBe(false);
    expect(bootstrap.productPaths, JSON.stringify(bootstrap.productPaths)).toEqual([]);
    expect(bootstrap.unrecognizedPaths, JSON.stringify(bootstrap.unrecognizedPaths)).toEqual([]);
    expect(bootstrap.ok).toBe(true);
  });

  it('mutation: forbidden product path in effective PR diff fails bootstrap safety', () => {
    const baseWorkflowYaml = gitShowAtRef(
      GOVERNANCE_PARITY_BASE_SHA,
      '.github/workflows/i18n-authority-protection.yml',
    );
    const baseContract = loadParsedWorkflowAuthorityContract(baseWorkflowYaml);
    const diffPaths = [
      ...effectiveDiffPaths(GOVERNANCE_PARITY_BASE_SHA),
      'frontend/src/rental/components/ForbiddenBootstrap.tsx',
    ];
    const bootstrap = evaluateBootstrapSafety(baseContract, diffPaths);
    expect(bootstrap.productOrPresentationChanged).toBe(true);
    expect(bootstrap.productPaths).toContain('frontend/src/rental/components/ForbiddenBootstrap.tsx');
    expect(bootstrap.ok).toBe(false);
  });

  it('preserves #1581/#1585 authority paths as authority-only under parsed HEAD classifier', () => {
    const contract = loadParsedWorkflowAuthorityContract(authorityProtectionWorkflowPath);
    const pr1581Paths = [
      'frontend/src/i18n/i18n-structural-check.test.ts',
      'frontend/src/i18n/translation-coverage-baseline.json',
      'frontend/src/i18n/translation-coverage.test.ts',
    ];
    for (const path of pr1581Paths) {
      expect(isParsedWorkflowAuthorityPath(path, contract)).toBe(true);
      expect(isParsedWorkflowProductOrPresentationPath(path, contract)).toBe(false);
    }
  });
});

describe('P2.3.3 PR gate — scanner eligibility helper', () => {
  it('matches existing scanner roots and exclusions', () => {
    expect(isScannerEligibleRelativePath('rental/components/BookingsView.tsx')).toBe(true);
    expect(isScannerEligibleRelativePath('rental/components/BookingsView.test.tsx')).toBe(false);
    expect(isScannerEligibleRelativePath('i18n/translations/en.ts')).toBe(false);
    expect(isScannerEligibleRelativePath('experimental/Outside.tsx')).toBe(false);
    expect(toSrcRelativePath('frontend/src/rental/App.tsx')).toBe('rental/App.tsx');
  });
});
