import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeAuthorityPathParity,
  buildAuthorityPathParitySampleSet,
  CANONICAL_GOVERNANCE_EXACT_PATHS,
  CANONICAL_GOVERNANCE_PREFIX_RULES,
  isCanonicalGovernanceAuthorityPath,
  isTrustedWorkflowAuthorityPath,
  TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES,
} from '../../scripts/lib/i18n-governance/authority-path-contract.mjs';
import {
  assertWorkflowYamlClassifierAligned,
  isWorkflowYamlAuthorityPath,
} from '../../scripts/lib/i18n-governance/workflow-authority-classifier.mjs';
import { isGovernanceAuthorityPath } from '../../scripts/lib/i18n-governance/pr-gate-policy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');

describe('Authority path contract — canonical vs trusted workflow parity', () => {
  it('pr-gate-policy delegates to canonical contract', () => {
    for (const path of buildAuthorityPathParitySampleSet()) {
      expect(isGovernanceAuthorityPath(path)).toBe(isCanonicalGovernanceAuthorityPath(path));
    }
  });

  it('has zero unexplained semantic drift on representative sample set', () => {
    const analysis = analyzeAuthorityPathParity(buildAuthorityPathParitySampleSet());
    expect(analysis.canonicalOnly, JSON.stringify(analysis.canonicalOnly)).toEqual([]);
    expect(analysis.semanticDifferences, JSON.stringify(analysis.semanticDifferences)).toEqual([]);
  });

  it('documents intentional workflow-only authority expansion for all GitHub workflows', () => {
    const workflowOnlyPaths = [
      '.github/workflows/deploy.yml',
      '.github/workflows/i18n-authority-protection.yml',
    ];
    const analysis = analyzeAuthorityPathParity(workflowOnlyPaths);
    expect(analysis.workflowOnly).toEqual([...workflowOnlyPaths].sort());
    expect(analysis.canonicalOnly).toEqual([]);
    expect(TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES).toHaveLength(1);
    expect(TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES[0]?.id).toBe('all-github-workflows');
  });

  it('canonical exact paths are always trusted-workflow authority', () => {
    for (const path of CANONICAL_GOVERNANCE_EXACT_PATHS) {
      expect(isTrustedWorkflowAuthorityPath(path), path).toBe(true);
      expect(isCanonicalGovernanceAuthorityPath(path), path).toBe(true);
    }
  });

  it('i18n-governance-new-debt.yml is canonical exact and covered by workflow prefix rule', () => {
    const path = '.github/workflows/i18n-governance-new-debt.yml';
    expect(isCanonicalGovernanceAuthorityPath(path)).toBe(true);
    expect(isTrustedWorkflowAuthorityPath(path)).toBe(true);
    expect(isWorkflowYamlAuthorityPath(path)).toBe(true);
  });

  it('preserves #1581/#1585 authority paths as authority-only (no product classification)', () => {
    const pr1581Paths = [
      'frontend/src/i18n/i18n-structural-check.test.ts',
      'frontend/src/i18n/translation-coverage-baseline.json',
      'frontend/src/i18n/translation-coverage.test.ts',
    ];
    for (const path of pr1581Paths) {
      expect(isTrustedWorkflowAuthorityPath(path)).toBe(true);
      expect(isCanonicalGovernanceAuthorityPath(path)).toBe(true);
      expect(path.startsWith('frontend/src/')).toBe(true);
    }
  });
});

describe('Authority path contract — boundary classification', () => {
  const authorityCases = [
    'frontend/scripts/i18n-check.mjs',
    'frontend/scripts/i18n-pr-gate.mjs',
    'frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs',
    'frontend/src/i18n/hardcoded-copy-guard.test.ts',
    '.cursor/rules/i18n.mdc',
    'AGENTS.md',
  ];

  const nonAuthorityCases = [
    'frontend/scripts/i18n-not-governance.ts',
    'frontend/scripts/not-i18n-foo.mjs',
    'frontend/src/rental/components/TopBar.tsx',
    'README.md',
    'docs/readme.md',
    'backend/src/modules/example/example.service.ts',
    'package.json',
  ];

  it.each(authorityCases)('%s is canonical and trusted-workflow authority', (path) => {
    expect(isCanonicalGovernanceAuthorityPath(path)).toBe(true);
    expect(isTrustedWorkflowAuthorityPath(path)).toBe(true);
  });

  it.each(nonAuthorityCases)('%s is not governance authority', (path) => {
    expect(isCanonicalGovernanceAuthorityPath(path)).toBe(false);
    expect(isTrustedWorkflowAuthorityPath(path)).toBe(false);
  });

  it('prefix rule accepts only .mjs under frontend/scripts/i18n-', () => {
    const rule = CANONICAL_GOVERNANCE_PREFIX_RULES.find(
      (entry) => entry.prefix === 'frontend/scripts/i18n-',
    );
    expect(rule).toBeDefined();
    expect(isCanonicalGovernanceAuthorityPath('frontend/scripts/i18n-check.mjs')).toBe(true);
    expect(isCanonicalGovernanceAuthorityPath('frontend/scripts/i18n-check.ts')).toBe(false);
    expect(isCanonicalGovernanceAuthorityPath('frontend/scripts/not-i18n-foo.mjs')).toBe(false);
  });

  it('unrelated workflow is workflow-only authority, not canonical', () => {
    const path = '.github/workflows/unrelated-ci.yml';
    expect(isCanonicalGovernanceAuthorityPath(path)).toBe(false);
    expect(isTrustedWorkflowAuthorityPath(path)).toBe(true);
  });
});

describe('Authority path contract — workflow YAML classifier alignment', () => {
  it('inline workflow classifier matches trusted contract mirror', () => {
    const result = assertWorkflowYamlClassifierAligned(repoRoot);
    expect(result.ok).toBe(true);
  });

  it('workflow YAML contains no actions/checkout (pull_request_target security)', () => {
    const workflowYaml = readFileSync(
      join(repoRoot, '.github/workflows/i18n-authority-protection.yml'),
      'utf8',
    );
    expect(workflowYaml).not.toMatch(/uses:\s*actions\/checkout/);
  });

  it('workflow YAML does not source repository runtime helpers', () => {
    const workflowYaml = readFileSync(
      join(repoRoot, '.github/workflows/i18n-authority-protection.yml'),
      'utf8',
    );
    expect(workflowYaml).not.toMatch(/source\s+\.github\/scripts\//);
    expect(workflowYaml).not.toMatch(/bash\s+\.github\/scripts\//);
  });
});
