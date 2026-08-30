import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildFindingFingerprint } from '../../scripts/lib/i18n-governance/fingerprint.mjs';
import { compareFindingsToManifest } from '../../scripts/lib/i18n-governance/comparator.mjs';
import {
  loadManifest,
  validateManifestSchema,
} from '../../scripts/lib/i18n-governance/manifest-validator.mjs';
import { scanSource } from '../../scripts/i18n-hardcoded-scan.mjs';

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

describe('i18n governance fingerprints', () => {
  it('is deterministic for identical inputs', () => {
    const input = {
      file: 'rental/components/Demo.tsx',
      category: 'TITLE',
      presentationOwner: 'title',
      sample: 'Tooltip',
      kind: 'INDIRECT_PROP',
    };
    expect(buildFindingFingerprint(input)).toBe(buildFindingFingerprint(input));
  });

  it('is stable across line shifts when literal/context unchanged', () => {
    const a = buildFindingFingerprint({
      file: 'rental/components/Demo.tsx',
      category: 'TITLE',
      presentationOwner: 'title',
      sample: 'Tooltip',
      kind: 'INDIRECT_PROP',
    });
    const b = buildFindingFingerprint({
      file: 'rental/components/Demo.tsx',
      category: 'TITLE',
      presentationOwner: 'title',
      sample: 'Tooltip',
      kind: 'INDIRECT_PROP',
    });
    expect(a).toBe(b);
  });
});

describe('i18n debt classification manifest', () => {
  it('validates manifest schema', () => {
    const manifest = loadManifest(manifestPath);
    const result = validateManifestSchema(manifest);
    expect(result.valid, result.errors.join('\n')).toBe(true);
  });

  it('classifies deferred master residuals without hiding active enforce-clean debt semantics', () => {
    const manifest = loadManifest(manifestPath);
    const masterFinding = {
      file: 'master/components/DemoView.tsx',
      line: 1,
      surface: 'MASTER',
      category: 'TEXT',
      sample: 'Legacy admin copy',
      severity: 'debt',
    };
    const comparison = compareFindingsToManifest([masterFinding], manifest);
    expect(comparison.classifiedResidualCount).toBe(1);
    expect(comparison.newUnclassifiedActiveHostDebtCount).toBe(0);
  });
});
