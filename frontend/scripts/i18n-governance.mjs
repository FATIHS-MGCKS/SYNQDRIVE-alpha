#!/usr/bin/env node
/**
 * P2.3.2 i18n governance orchestrator:
 * scan → manifest validation → baseline comparison.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './i18n-hardcoded-scan.mjs';
import { compareFindingsToManifest, formatDiagnostic } from './lib/i18n-governance/comparator.mjs';
import { CLASSIFICATIONS } from './lib/i18n-governance/classifications.mjs';
import {
  loadManifest,
  validateManifestAgainstInventory,
  validateManifestSchema,
} from './lib/i18n-governance/manifest-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const manifestPath = join(frontendRoot, 'src/i18n/i18n-debt-classifications.json');

function printSection(title) {
  console.log('');
  console.log(title);
}

function main() {
  const manifest = loadManifest(manifestPath);
  const schema = validateManifestSchema(manifest);
  if (!schema.valid) {
    console.error('Manifest schema validation failed:');
    for (const error of schema.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const { findings, summary } = scanRepository({ includeEnhanced: true });
  const inventoryValidation = validateManifestAgainstInventory(manifest, findings);
  if (!inventoryValidation.valid) {
    console.error('Manifest inventory validation failed:');
    for (const error of inventoryValidation.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const comparison = compareFindingsToManifest(findings, manifest);

  printSection('i18n governance summary');
  console.log(`Total findings: ${comparison.totalFindings}`);
  console.log(`Classified residual findings: ${comparison.classifiedResidualCount}`);
  console.log(`Unclassified findings: ${comparison.unclassifiedCount}`);
  console.log(`Baseline residual findings: ${comparison.baselineResidualCount}`);
  console.log(`Active remediation findings: ${comparison.activeRemediationCount}`);
  console.log(
    `NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT: ${comparison.newUnclassifiedActiveHostDebtCount}`,
  );
  console.log('By classification:', comparison.byClassification);
  console.log('Scanner summary:', summary);

  if (inventoryValidation.warnings.length > 0) {
    printSection('Manifest warnings');
    for (const warning of inventoryValidation.warnings) console.warn(`  - ${warning}`);
  }

  if (comparison.newUnclassifiedActiveHostDebtCount > 0) {
    printSection('New active host debt diagnostics');
    for (const finding of comparison.newUnclassifiedActiveHostDebt.slice(0, 50)) {
      const diagnostic = formatDiagnostic(finding);
      console.log(
        `  ${diagnostic.path}:${diagnostic.line} [${diagnostic.kind}] ${diagnostic.literal}`,
      );
      console.log(
        `    fingerprint=${diagnostic.fingerprint} classification=${diagnostic.classification}`,
      );
      console.log(`    action: ${diagnostic.suggestedAction}`);
    }
    if (comparison.newUnclassifiedActiveHostDebtCount > 50) {
      console.log(`  ... and ${comparison.newUnclassifiedActiveHostDebtCount - 50} more`);
    }
  }

  if (comparison.activeRemediationCount > 0) {
    printSection('Active remediation host debt (baseline-known, unresolved)');
    for (const finding of comparison.activeRemediationFindings.slice(0, 50)) {
      const diagnostic = formatDiagnostic(finding);
      console.log(
        `  ${diagnostic.path}:${diagnostic.line} [${diagnostic.kind}] ${diagnostic.literal}`,
      );
      console.log(
        `    fingerprint=${diagnostic.fingerprint} classification=${diagnostic.classification}`,
      );
      console.log(`    action: ${diagnostic.suggestedAction}`);
    }
    if (comparison.activeRemediationCount > 50) {
      console.log(`  ... and ${comparison.activeRemediationCount - 50} more`);
    }
  }

  const hasBlockingGovernanceDebt =
    comparison.newUnclassifiedActiveHostDebtCount > 0 || comparison.activeRemediationCount > 0;

  if (hasBlockingGovernanceDebt) {
    process.exit(2);
  }

  console.log('');
  console.log('i18n governance checks passed.');
}

main();
