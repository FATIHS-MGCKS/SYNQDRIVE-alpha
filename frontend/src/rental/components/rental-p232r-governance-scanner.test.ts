import { describe, expect, it } from 'vitest';
import { scanRepository } from '../../../scripts/i18n-hardcoded-scan.mjs';
import { compareFindingsToManifest } from '../../../scripts/lib/i18n-governance/comparator.mjs';
import { loadManifest } from '../../../scripts/lib/i18n-governance/manifest-validator.mjs';

describe('P2.3.2R governance scanner', () => {
  it('reports zero active remediation with unchanged baseline', () => {
    const manifest = loadManifest('src/i18n/i18n-debt-classifications.json');
    const { findings } = scanRepository({ includeEnhanced: true });
    const comparison = compareFindingsToManifest(findings, manifest);
    expect(comparison.activeRemediationCount).toBe(0);
    expect(comparison.newUnclassifiedActiveHostDebtCount).toBe(0);
    expect(manifest.governanceBaseline.findingCount).toBe(1627);
    expect(manifest.governanceBaseline.fingerprintVersion).toBe(3);
  });
});
