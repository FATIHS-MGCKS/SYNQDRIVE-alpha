import { normalizeRepoPath } from './git-diff.mjs';

/**
 * Canonical governance authority path contract.
 *
 * This module is the single source of truth for checkout-based JS governance
 * (pr-gate-policy, new-debt bootstrap relevance). The trusted
 * pull_request_target workflow keeps an inline duplicate classifier for
 * security (no PR-head checkout/execution). Parity is enforced by
 * i18n-pr-gate.test.ts (parity section) and the classifier harness.
 */

/** Exact repo paths that are governance authority artifacts or machinery. */
export const CANONICAL_GOVERNANCE_EXACT_PATHS = [
  '.cursor/rules/i18n.mdc',
  'AGENTS.md',
  '.github/workflows/i18n-governance-new-debt.yml',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/src/i18n/hardcoded-copy-inventory.json',
  'frontend/src/i18n/hardcoded-copy-guard.test.ts',
  'frontend/src/i18n/translation-coverage-baseline.json',
  'frontend/src/i18n/translation-coverage.ts',
  'frontend/src/i18n/translation-coverage.test.ts',
  'frontend/src/i18n/i18n-debt-classifications.json',
  'frontend/src/i18n/i18n-governance-scanner.test.ts',
  'frontend/src/i18n/i18n-pr-gate.test.ts',
  'frontend/src/i18n/i18n-structural-check.test.ts',
  'frontend/src/i18n/locales.test.ts',
  'frontend/src/i18n/translation-registry.test.ts',
];

/**
 * Prefix rules for canonical governance authority paths.
 * extension: when set, path must end with this suffix under the prefix.
 */
export const CANONICAL_GOVERNANCE_PREFIX_RULES = [
  { prefix: 'frontend/scripts/i18n-', extension: '.mjs' },
  { prefix: 'frontend/scripts/lib/i18n-governance/', extension: null },
];

/**
 * Intentional expansions in the trusted pull_request_target workflow classifier
 * that are broader than the canonical JS contract.
 *
 * Rationale: pull_request_target runs without checkout and must fail-closed on
 * security-critical workflow tampering. Any .github/workflows/* change in a PR
 * that also touches i18n authority requires trusted reapproval; standalone
 * workflow-only PRs also require the governance authority label.
 */
export const TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES = [
  {
    id: 'all-github-workflows',
    reason:
      'pull_request_target cannot checkout PR head; all workflow files are security-critical governance surface',
    type: 'prefix',
    prefix: '.github/workflows/',
  },
];

const CANONICAL_EXACT_SET = new Set(CANONICAL_GOVERNANCE_EXACT_PATHS);

function bashCasePatternToRegExp(pattern) {
  let regex = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      regex += '.*';
      continue;
    }
    if (ch === '?') {
      regex += '.';
      continue;
    }
    if ('\\.[]^$+{}()|'.includes(ch)) {
      regex += `\\${ch}`;
      continue;
    }
    regex += ch;
  }
  regex += '$';
  return new RegExp(regex);
}

export function pathMatchesShellCasePattern(repoPath, pattern) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return false;
  return bashCasePatternToRegExp(pattern).test(normalized);
}

export function deriveShellPatternFromPrefixRule({ prefix, extension }) {
  if (extension) {
    return `${prefix}*${extension}`;
  }
  return `${prefix}*`;
}

export function deriveShellPatternFromWorkflowOnlyRule(rule) {
  if (rule.type !== 'prefix') {
    throw new Error(`Unsupported trusted workflow-only rule type: ${rule.type}`);
  }
  return `${rule.prefix}*`;
}

/**
 * Algorithmically derive the trusted workflow authority pattern set from canonical
 * structures. Wildcards are generated from prefix rules; exact paths omitted when
 * already subsumed by a derived wildcard.
 */
export function buildExpectedTrustedWorkflowAuthorityPatterns() {
  const wildcardPatterns = [
    ...CANONICAL_GOVERNANCE_PREFIX_RULES.map(deriveShellPatternFromPrefixRule),
    ...TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES.map(deriveShellPatternFromWorkflowOnlyRule),
  ];

  const exactPatterns = CANONICAL_GOVERNANCE_EXACT_PATHS.filter(
    (path) => !wildcardPatterns.some((pattern) => pathMatchesShellCasePattern(path, pattern)),
  );

  return [...new Set([...wildcardPatterns, ...exactPatterns])].sort();
}

export function matchesPrefixRule(normalizedPath, { prefix, extension }) {
  if (!normalizedPath.startsWith(prefix)) return false;
  if (extension === null) return true;
  return normalizedPath.endsWith(extension);
}

/** Canonical JS / checkout-based governance authority classifier. */
export function isCanonicalGovernanceAuthorityPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return false;
  if (CANONICAL_EXACT_SET.has(normalized)) return true;
  return CANONICAL_GOVERNANCE_PREFIX_RULES.some((rule) =>
    matchesPrefixRule(normalized, rule),
  );
}

/** Trusted workflow inline classifier semantics (mirrors bash is_authority_path). */
export function isTrustedWorkflowAuthorityPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return false;

  for (const rule of TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES) {
    if (rule.type === 'prefix' && normalized.startsWith(rule.prefix)) {
      return true;
    }
  }

  if (CANONICAL_EXACT_SET.has(normalized)) return true;

  return CANONICAL_GOVERNANCE_PREFIX_RULES.some((rule) =>
    matchesPrefixRule(normalized, rule),
  );
}

function matchesWorkflowOnlyRule(normalizedPath) {
  return TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES.some((rule) => {
    if (rule.type !== 'prefix') return false;
    return normalizedPath.startsWith(rule.prefix);
  });
}

function isCanonicalOnlyDueToExactWorkflowPath(normalizedPath) {
  return (
    normalizedPath === '.github/workflows/i18n-governance-new-debt.yml' &&
    !matchesWorkflowOnlyRule(normalizedPath)
  );
}

/**
 * Compare canonical and trusted-workflow authority classification.
 * Returns drift sets for regression testing.
 */
export function analyzeAuthorityPathParity(samplePaths) {
  const workflowOnly = [];
  const canonicalOnly = [];
  const semanticDifferences = [];

  for (const rawPath of samplePaths) {
    const path = normalizeRepoPath(rawPath);
    const canonical = isCanonicalGovernanceAuthorityPath(path);
    const workflow = isTrustedWorkflowAuthorityPath(path);

    if (workflow && !canonical) {
      if (matchesWorkflowOnlyRule(path)) {
        workflowOnly.push(path);
      } else {
        semanticDifferences.push({
          path,
          kind: 'WORKFLOW_AUTHORITY_NOT_CANONICAL',
          canonical,
          workflow,
        });
      }
      continue;
    }

    if (canonical && !workflow) {
      canonicalOnly.push(path);
      continue;
    }

    if (canonical && workflow && isCanonicalOnlyDueToExactWorkflowPath(path)) {
      // Covered by workflow-only prefix rule; not a semantic mismatch.
      continue;
    }
  }

  return {
    workflowOnly: [...new Set(workflowOnly)].sort(),
    canonicalOnly: [...new Set(canonicalOnly)].sort(),
    semanticDifferences,
  };
}

/** Representative boundary samples for parity regression enumeration. */
export function buildAuthorityPathParitySampleSet() {
  return [
    ...CANONICAL_GOVERNANCE_EXACT_PATHS,
    '.github/workflows/i18n-authority-protection.yml',
    '.github/workflows/deploy.yml',
    '.github/workflows/unrelated-ci.yml',
    'frontend/scripts/i18n-check.mjs',
    'frontend/scripts/i18n-pr-gate.mjs',
    'frontend/scripts/i18n-hardcoded-scan.mjs',
    'frontend/scripts/i18n-governance.mjs',
    'frontend/scripts/i18n-shim-inventory.mjs',
    'frontend/scripts/i18n-not-governance.ts',
    'frontend/scripts/lib/i18n-governance/pr-gate-policy.mjs',
    'frontend/scripts/lib/i18n-governance/authority-path-contract.mjs',
    'frontend/src/rental/components/TopBar.tsx',
    'frontend/src/i18n/de.ts',
    'README.md',
    'docs/readme.md',
    'backend/src/modules/example/example.service.ts',
    'package.json',
    'frontend/package.json.bak',
  ];
}

/** Layer A bootstrap relevance contract — aligned with new-debt workflow inline step. */
export const BOOTSTRAP_RELEVANT_PATH_CONTRACT = {
  prefixes: ['frontend/src/', ...CANONICAL_GOVERNANCE_PREFIX_RULES.map((r) => r.prefix)],
  exact: [...CANONICAL_GOVERNANCE_EXACT_PATHS],
  scriptSuffix: '.mjs',
};
