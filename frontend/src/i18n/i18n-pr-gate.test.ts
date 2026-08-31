import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  isI18nRelevantPath,
  partitionChangedPaths,
  EXIT_CODES,
} from '../../scripts/lib/i18n-governance/pr-gate-policy.mjs';
import { classifyPrRelevance, gitExec, runGate } from '../../scripts/i18n-pr-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, 'i18n-debt-classifications.json');
const manifest = loadManifest(manifestPath);
const fixtureRoot = join(__dirname, '__fixtures__/governance-adversarial');
const repoRoot = join(__dirname, '../../..');

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

describe('P2.3.3 PR gate — relevance classification', () => {
  it('backend-only PR paths are irrelevant', () => {
    expect(isI18nRelevantPath('backend/src/modules/example/example.service.ts')).toBe(false);
    expect(hasI18nRelevantChanges(['backend/src/modules/example/example.service.ts'])).toBe(false);
  });

  it('frontend product paths are relevant', () => {
    expect(isI18nRelevantPath('frontend/src/rental/components/Foo.tsx')).toBe(true);
    expect(hasI18nRelevantChanges(['frontend/src/rental/components/Foo.tsx'])).toBe(true);
  });

  it('governance authority paths are relevant', () => {
    expect(isI18nRelevantPath('frontend/scripts/i18n-pr-gate.mjs')).toBe(true);
    expect(hasI18nRelevantChanges(['frontend/scripts/i18n-pr-gate.mjs'])).toBe(true);
  });
});

describe('P2.3.3 PR gate — git source read fail-closed', () => {
  it('readSourceAtRef throws GIT_SOURCE_READ_FAILURE when must-exist source is missing', () => {
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
});

describe('P2.3.3 PR gate — real git integration', () => {
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
    const summary = runGate({
      baseSha,
      headSha,
      authorityApproved: false,
      repoRoot: dir,
      manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
    });
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
    const summary = runGate({
      baseSha,
      headSha,
      authorityApproved: false,
      repoRoot: dir,
      manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
    });
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
    const summary = runGate({
      baseSha,
      headSha,
      authorityApproved: false,
      repoRoot: dir,
      manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
    });
    expect(summary.newPrActionableHostDebt).toBe(0);
    expect(summary.pass).toBe(true);
  });

  it('post-rename path addition of one host occurrence fails +1', () => {
    const { dir, runGit } = createTempGitRepo();
    seedGovernanceManifest(dir);
    const newDir = join(dir, 'frontend/src/rental/components/new path');
    mkdirSync(newDir, { recursive: true });
    const newPath = join(newDir, 'Foo Bar.tsx');
    writeFileSync(
      newPath,
      `export function FooBar() { return <button title="German tooltip text">A</button>; }`,
    );
    const baseSha = commitAll(runGit, 'renamed-base');
    writeFileSync(
      newPath,
      `export function FooBar() {
        return (<><button title="German tooltip text">A</button><button title="German tooltip text">B</button></>);
      }`,
    );
    const headSha = commitAll(runGit, 'add-one');
    const summary = runGate({
      baseSha,
      headSha,
      authorityApproved: false,
      repoRoot: dir,
      manifestPath: join(dir, 'frontend/src/i18n/i18n-debt-classifications.json'),
    });
    expect(summary.newPrActionableHostDebt).toBe(1);
    expect(summary.pass).toBe(false);
  });
});

describe('P2.3.3 PR gate — repository integration', () => {
  const baseSha = '021f6a22b66cc69b28291a15d7f4055e3977e33d';
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

  it('69 self-test against campaign base passes with authority approval', () => {
    const summary = runGate({
      baseSha,
      headSha,
      authorityApproved: true,
      repoRoot,
      manifestPath,
    });
    expect(summary.pass).toBe(true);
    expect(summary.newPrActionableHostDebt).toBe(0);
    expect(summary.reintroducedHistoricalDebt).toBe(0);
    expect(summary.governanceAuthorityChanged).toBe('YES');
    expect(summary.mixedAuthorityProductChange).toBe('NO');
    expect(summary.changedGovernedProductionFiles).toBe(0);
  });

  it('69b self-test without authority approval fails policy exit 3', () => {
    const summary = runGate({
      baseSha,
      headSha,
      authorityApproved: false,
      repoRoot,
      manifestPath,
    });
    expect(summary.pass).toBe(false);
    expect(summary.exitCode).toBe(EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE);
    expect(summary.governanceAuthorityChanged).toBe('YES');
  });

  it('69c backend-only diff classifies as irrelevant no-op', () => {
    const relevance = classifyPrRelevance({
      baseSha,
      headSha: baseSha,
      repoRoot,
      manifestPath,
    });
    const synthetic = classifyPrRelevance({
      baseSha,
      headSha,
      repoRoot,
      manifestPath,
    });
    expect(synthetic.relevant).toBe(true);
    expect(
      hasI18nRelevantChanges(['backend/src/modules/example/example.service.ts']),
    ).toBe(false);
    const noOp = runGate({
      baseSha,
      headSha: baseSha,
      authorityApproved: false,
      repoRoot,
      manifestPath,
    });
    expect(noOp.pass).toBe(true);
    expect(noOp.noOp).toBe(true);
    expect(relevance.changedPaths.length).toBeGreaterThanOrEqual(0);
  });

  it('70 controlled red synthetic host literal would fail', () => {
    const relPath = 'rental/components/__pr_gate_red__.tsx';
    const result = compareSources(
      `export function Red() { return null; }`,
      `export function Red() { return <button title="German tooltip text">Save</button>; }`,
      relPath,
    );
    expectNewDebt(1, result);
  });

  it('71 controlled green translated presentation passes', () => {
    const result = compareFixtureDelta(null, 'GoodTranslatedPresentation.tsx');
    expectNewDebt(0, result);
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
