import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildFindingFingerprint } from '../../scripts/lib/i18n-governance/fingerprint.mjs';
import {
  classifyFinding,
  compareFindingsToManifest,
  isNewUnclassifiedActiveHostDebt,
} from '../../scripts/lib/i18n-governance/comparator.mjs';
import { CLASSIFICATIONS } from '../../scripts/lib/i18n-governance/classifications.mjs';
import {
  loadManifest,
  validateManifestSchema,
} from '../../scripts/lib/i18n-governance/manifest-validator.mjs';
import { scanRepositoryBaseline } from '../../scripts/lib/i18n-governance/baseline-scan-p231.mjs';
import { scanSource, scanRepository } from '../../scripts/i18n-hardcoded-scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(__dirname, '__fixtures__/governance-adversarial');
const manifestPath = join(__dirname, 'i18n-debt-classifications.json');

const POSITIVE_FIXTURES = [
  'BadDirectJsx.tsx',
  'BadTitleLiteral.tsx',
  'BadAriaLiteral.tsx',
  'BadAriaDescriptionLiteral.tsx',
  'BadPlaceholderLiteral.tsx',
  'BadAltLiteral.tsx',
  'BadHomeAwayRegression.tsx',
  'BadConditionalAria.tsx',
  'BadTemplateLiteral.tsx',
  'BadToastLiteral.tsx',
  'BadErrorFallback.tsx',
];

const NEGATIVE_FIXTURES = [
  'GoodMachineEnum.tsx',
  'GoodRouteConstant.tsx',
  'GoodQueryKey.tsx',
  'GoodCssClass.tsx',
  'GoodTestId.tsx',
  'GoodOrganizationName.tsx',
  'GoodVinVariable.tsx',
  'GoodLicenseVariable.tsx',
  'GoodRawErrorMessage.tsx',
  'GoodProviderMessage.tsx',
  'GoodTranslatedPresentation.tsx',
  'GoodMachineResolver.tsx',
  'GoodTranslatedInterpolation.tsx',
];

function scanFixture(fileName) {
  const filePath = join(fixtureRoot, fileName);
  const source = readFileSync(filePath, 'utf8');
  const relPath = `i18n/__fixtures__/governance-adversarial/${fileName}`;
  return scanSource(relPath, source, { includeEnhanced: true });
}

function emptyBaselineManifest() {
  const manifest = loadManifest(manifestPath);
  return {
    ...manifest,
    baselineFingerprints: [],
    entries: [],
  };
}

function countNewDebt(relPath, source) {
  const findings = scanSource(relPath, source, { includeEnhanced: true });
  const comparison = compareFindingsToManifest(findings, emptyBaselineManifest());
  return comparison.newUnclassifiedActiveHostDebtCount;
}

describe('i18n governance scanner fixtures', () => {
  for (const fileName of POSITIVE_FIXTURES) {
    it(`detects host presentation in ${fileName}`, () => {
      const findings = scanFixture(fileName);
      expect(findings.length, fileName).toBeGreaterThan(0);
    });
  }

  for (const fileName of NEGATIVE_FIXTURES) {
    it(`does not flag ${fileName}`, () => {
      const findings = scanFixture(fileName);
      expect(findings, fileName).toEqual([]);
    });
  }

  it('detects HomeAwayBadge-class indirect title regression', () => {
    const findings = scanFixture('BadHomeAwayRegression.tsx');
    expect(findings.some((f) => f.presentationOwner === 'title')).toBe(true);
    expect(findings.some((f) => /Heimatstandort|Umkreis/.test(f.sample))).toBe(true);
  });
});

describe('i18n governance fingerprints v2', () => {
  it('is deterministic for identical inputs', () => {
    const input = {
      file: 'rental/components/Demo.tsx',
      category: 'TITLE',
      presentationOwner: 'title',
      sample: 'Tooltip',
      kind: 'INDIRECT_PROP',
      structuralContext: 'DemoCard',
    };
    expect(buildFindingFingerprint(input)).toBe(buildFindingFingerprint(input));
  });

  it('distinguishes identical literals in different components', () => {
    const source = `
function SaveButtonA() { return <button title="Save changes now" />; }
function SaveButtonB() { return <button title="Save changes now" />; }
`;
    const findings = scanSource('rental/components/Demo.tsx', source, { includeEnhanced: true });
    const titleFindings = findings.filter((f) => f.category === 'TITLE');
    expect(titleFindings.length).toBeGreaterThanOrEqual(2);
    expect(new Set(titleFindings.map((f) => f.fingerprint)).size).toBeGreaterThanOrEqual(2);
  });

  it('distinguishes identical literals with different presentation owners', () => {
    const a = buildFindingFingerprint({
      file: 'rental/components/Demo.tsx',
      category: 'TITLE',
      presentationOwner: 'title',
      sample: 'Speichern',
      kind: 'DIRECT_PROP',
      structuralContext: 'Demo',
    });
    const b = buildFindingFingerprint({
      file: 'rental/components/Demo.tsx',
      category: 'ARIA',
      presentationOwner: 'aria-label',
      sample: 'Speichern',
      kind: 'DIRECT_PROP',
      structuralContext: 'Demo',
    });
    expect(a).not.toBe(b);
  });

  it('remains stable across blank-line shifts', () => {
    const compact = `
function Demo() {
  return <button title="Tooltip" />;
}
`;
    const shifted = `
function Demo() {


  return <button title="Tooltip" />;


}
`;
    const compactFp = scanSource('rental/components/Demo.tsx', compact, { includeEnhanced: true })[0]
      ?.fingerprint;
    const shiftedFp = scanSource('rental/components/Demo.tsx', shifted, { includeEnhanced: true })[0]
      ?.fingerprint;
    expect(compactFp).toBe(shiftedFp);
  });

  it('changes when literal changes', () => {
    const before = buildFindingFingerprint({
      file: 'rental/components/Demo.tsx',
      category: 'TITLE',
      presentationOwner: 'title',
      sample: 'Speichern',
      kind: 'DIRECT_PROP',
      structuralContext: 'Demo',
    });
    const after = buildFindingFingerprint({
      file: 'rental/components/Demo.tsx',
      category: 'TITLE',
      presentationOwner: 'title',
      sample: 'Sichern',
      kind: 'DIRECT_PROP',
      structuralContext: 'Demo',
    });
    expect(before).not.toBe(after);
  });
});

describe('i18n debt classification manifest', () => {
  it('validates manifest schema and rejects broad production-root rules', () => {
    const manifest = loadManifest(manifestPath);
    const result = validateManifestSchema(manifest);
    expect(result.valid, result.errors.join('\n')).toBe(true);

    const unsafe = {
      ...manifest,
      rules: [
        ...manifest.rules,
        {
          id: 'unsafe-master-root',
          classification: CLASSIFICATIONS.LEGACY_DEAD,
          pathPattern: '^master/',
          owner: 'platform-frontend',
          reason: 'unsafe',
          surfaceStatus: 'mounted',
        },
      ],
    };
    const unsafeResult = validateManifestSchema(unsafe);
    expect(unsafeResult.valid).toBe(false);
    expect(unsafeResult.errors.some((error) => error.includes('broad production-root'))).toBe(true);
  });

  it('does not auto-justify new host copy on broad mounted roots', () => {
    const cases = [
      ['rental/NewView.tsx', 'export function NewView() { return <div title="Neue aktive Kopie" />; }'],
      ['master/NewView.tsx', 'export function NewView() { return <div aria-label="Neue aktive Kopie" />; }'],
      ['operator/NewView.tsx', 'export function NewView() { return <input placeholder="Neue aktive Kopie" />; }'],
      ['pages/NewPage.tsx', 'export function NewPage() { return <div title="Neue aktive Kopie" />; }'],
      ['lib/NewWidget.tsx', 'export function NewWidget() { toast("Neue aktive Kopie"); return null; }'],
    ] as const;

    for (const [relPath, source] of cases) {
      expect(countNewDebt(relPath, source), relPath).toBeGreaterThan(0);
    }
  });

  it('does not classify Help Center shell chrome as editorial content', () => {
    const source =
      'export function HelpCenterView() { return <button aria-label="Neue Shell Kopie" />; }';
    const findings = scanSource('rental/components/HelpCenterView.tsx', source, {
      includeEnhanced: true,
    });
    const comparison = compareFindingsToManifest(findings, emptyBaselineManifest());
    expect(
      comparison.newUnclassifiedActiveHostDebt.every(
        (finding) => finding.classification !== CLASSIFICATIONS.EDITORIAL_CONTENT,
      ),
    ).toBe(true);
    expect(comparison.newUnclassifiedActiveHostDebt.length).toBeGreaterThan(0);
  });

  it('keeps baseline-known findings visible without marking them as new', () => {
    const manifest = loadManifest(manifestPath);
    const fingerprint = manifest.baselineFingerprints[0];
    expect(fingerprint).toBeTruthy();

    const finding = {
      file: 'rental/components/Demo.tsx',
      line: 10,
      surface: 'RENTAL',
      category: 'TEXT',
      sample: 'Baseline copy',
      severity: 'debt',
      fingerprint,
    };
    const result = classifyFinding(finding, manifest);
    expect(result.isBaselineKnown).toBe(true);
    expect(result.isNewUnclassifiedActiveHostDebt).toBe(false);
    expect(result.classification).toBe(CLASSIFICATIONS.PREEXISTING_BASELINE_DEBT);
  });

  it('never suppresses enforce-clean findings via broad rules', () => {
    const manifest = loadManifest(manifestPath);
    const finding = {
      file: 'rental/App.tsx',
      line: 1,
      surface: 'RENTAL',
      category: 'TOAST',
      presentationOwner: 'toast',
      kind: 'TOAST_LITERAL',
      sample: 'Neue enforce-clean Kopie',
      severity: 'enforce-clean',
    };
    const result = classifyFinding(finding, manifest);
    expect(result.classification).toBe(CLASSIFICATIONS.ACTIVE_REMEDIATION_REQUIRED);
    expect(
      isNewUnclassifiedActiveHostDebt(
        { ...finding, fingerprint: result.fingerprint },
        result.classification,
        result.source,
        new Set(manifest.baselineFingerprints),
      ),
    ).toBe(true);
  });
});

describe('legacy scanner compatibility', () => {
  it('preserves P2.3.1 closeout legacy counts', () => {
    const baseline = scanRepositoryBaseline();
    const current = scanRepository({ includeEnhanced: false });
    expect(current.summary.total).toBe(1241);
    expect(current.summary.bySurface.RENTAL).toBe(144);
    expect(current.summary.byRentalModule['Finance/Billing']).toBe(25);
    expect(current.summary.total).toBe(baseline.summary.total);
    expect(current.summary.bySurface.RENTAL).toBe(baseline.summary.bySurface.RENTAL);
    expect(current.summary.byRentalModule['Finance/Billing']).toBe(
      baseline.summary.byRentalModule['Finance/Billing'],
    );
  });

  it('has zero unexplained legacy set-diff against P2.3.1 baseline scanner', () => {
    const baseline = scanRepositoryBaseline();
    const current = scanRepository({ includeEnhanced: false });
    function key(f: { surface: string; category: string; sample: string }) {
      return `${f.surface}|${f.category}|${f.sample}`;
    }
    const baseMap = new Map(baseline.findings.map((f) => [key(f), f]));
    const curMap = new Map(current.findings.map((f) => [key(f), f]));
    const removed = [...baseMap.keys()].filter((k) => !curMap.has(k));
    const added = [...curMap.keys()].filter((k) => !baseMap.has(k));
    expect(removed, removed.join('\n')).toEqual([]);
    expect(added, added.join('\n')).toEqual([]);
  });
});

describe('governance adversarial fixture inventory', () => {
  it('has expected fixture files present', () => {
    const files = readdirSync(fixtureRoot).filter((name) => name.endsWith('.tsx'));
    expect(files.length).toBeGreaterThanOrEqual(POSITIVE_FIXTURES.length + NEGATIVE_FIXTURES.length);
  });
});
