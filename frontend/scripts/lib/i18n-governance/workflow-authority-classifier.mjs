import { readFileSync } from 'node:fs';
import { isTrustedWorkflowAuthorityPath } from './authority-path-contract.mjs';

/**
 * Parse the inline is_authority_path() bash function from the trusted workflow
 * YAML and evaluate paths using the same semantics as the extracted run script.
 *
 * This does NOT execute workflow code. It mirrors the bash case statement for
 * drift detection only.
 */

const WORKFLOW_AUTHORITY_PATTERNS = {
  workflowPrefix: '.github/workflows/',
  rootExact: new Set(['.cursor/rules/i18n.mdc', 'AGENTS.md']),
  exactScripts: new Set([
    'frontend/scripts/i18n-hardcoded-scan.mjs',
    'frontend/scripts/i18n-check.mjs',
    'frontend/scripts/i18n-governance.mjs',
    'frontend/scripts/i18n-pr-gate.mjs',
    'frontend/scripts/i18n-shim-inventory.mjs',
  ]),
  governanceLibPrefix: 'frontend/scripts/lib/i18n-governance/',
  packageFiles: new Set(['frontend/package.json', 'frontend/package-lock.json']),
  exactI18nPaths: new Set([
    'frontend/src/i18n/i18n-debt-classifications.json',
    'frontend/src/i18n/i18n-pr-gate.test.ts',
    'frontend/src/i18n/i18n-governance-scanner.test.ts',
    'frontend/src/i18n/translation-registry.test.ts',
    'frontend/src/i18n/locales.test.ts',
    'frontend/src/i18n/i18n-structural-check.test.ts',
    'frontend/src/i18n/hardcoded-copy-guard.test.ts',
    'frontend/src/i18n/hardcoded-copy-inventory.json',
    'frontend/src/i18n/translation-coverage.ts',
    'frontend/src/i18n/translation-coverage-baseline.json',
    'frontend/src/i18n/translation-coverage.test.ts',
  ]),
};

/** Classify using patterns extracted from workflow YAML inline bash. */
export function isWorkflowYamlAuthorityPath(repoPath) {
  const path = String(repoPath ?? '').replace(/^\.\/+/, '');
  if (!path) return false;

  if (path.startsWith(WORKFLOW_AUTHORITY_PATTERNS.workflowPrefix)) return true;
  if (WORKFLOW_AUTHORITY_PATTERNS.rootExact.has(path)) return true;
  if (WORKFLOW_AUTHORITY_PATTERNS.exactScripts.has(path)) return true;
  if (path.startsWith(WORKFLOW_AUTHORITY_PATTERNS.governanceLibPrefix)) return true;
  if (WORKFLOW_AUTHORITY_PATTERNS.packageFiles.has(path)) return true;
  if (WORKFLOW_AUTHORITY_PATTERNS.exactI18nPaths.has(path)) return true;

  return false;
}

export function extractWorkflowAuthorityExactI18nCaseLine(workflowYaml) {
  const match = workflowYaml.match(
    /frontend\/src\/i18n\/[^|]+\|[^)]+\)/,
  );
  return match?.[0] ?? '';
}

export function assertWorkflowYamlClassifierAligned(repoRoot) {
  const workflowPath = `${repoRoot}/.github/workflows/i18n-authority-protection.yml`;
  const workflowYaml = readFileSync(workflowPath, 'utf8');

  if (workflowYaml.includes('uses:') && /uses:\s*actions\/checkout/.test(workflowYaml)) {
    throw new Error('i18n-authority-protection workflow must not checkout PR head');
  }

  const samples = [
    'frontend/src/i18n/translation-coverage-baseline.json',
    'frontend/src/i18n/translation-coverage.test.ts',
    'frontend/src/i18n/i18n-structural-check.test.ts',
    '.cursor/rules/i18n.mdc',
    'AGENTS.md',
    'frontend/src/i18n/hardcoded-copy-inventory.json',
    'frontend/src/i18n/translation-coverage.ts',
    'frontend/src/i18n/hardcoded-copy-guard.test.ts',
    'frontend/scripts/i18n-check.mjs',
    '.github/workflows/deploy.yml',
    'frontend/src/rental/Foo.tsx',
  ];

  const mismatches = [];
  for (const path of samples) {
    const yamlResult = isWorkflowYamlAuthorityPath(path);
    const contractResult = isTrustedWorkflowAuthorityPath(path);
    if (yamlResult !== contractResult) {
      mismatches.push({ path, yamlResult, contractResult });
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Workflow YAML classifier drift: ${JSON.stringify(mismatches, null, 2)}`,
    );
  }

  const caseLine = extractWorkflowAuthorityExactI18nCaseLine(workflowYaml);
  for (const required of [
    'translation-coverage-baseline.json',
    'translation-coverage.test.ts',
    'hardcoded-copy-guard.test.ts',
    'hardcoded-copy-inventory.json',
    'translation-coverage.ts',
  ]) {
    if (!caseLine.includes(required)) {
      throw new Error(`Workflow authority case line missing ${required}`);
    }
  }

  if (!workflowYaml.includes('.cursor/rules/i18n.mdc')) {
    throw new Error('Workflow authority classifier missing .cursor/rules/i18n.mdc');
  }
  if (!workflowYaml.includes('AGENTS.md')) {
    throw new Error('Workflow authority classifier missing AGENTS.md');
  }

  return { ok: true, caseLine };
}
