import { normalizeRepoPath, toSrcRelativePath } from './git-diff.mjs';

/** Canonical protected governance paths — workflow bootstrap and JS gate must stay aligned. */
export const PROTECTED_GOVERNANCE_EXACT_PATHS = [
  '.cursor/rules/i18n.mdc',
  'AGENTS.md',
  '.github/workflows/i18n-governance-new-debt.yml',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/src/i18n/hardcoded-copy-inventory.json',
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

export const PROTECTED_GOVERNANCE_PREFIXES = [
  'frontend/scripts/i18n-',
  'frontend/scripts/lib/i18n-governance/',
];

export const GOVERNANCE_AUTHORITY_PREFIXES = [
  ...PROTECTED_GOVERNANCE_EXACT_PATHS,
  ...PROTECTED_GOVERNANCE_PREFIXES,
];

/** Layer A bootstrap relevance contract — must stay aligned with workflow-inline Classify PR relevance step */
export const BOOTSTRAP_RELEVANT_PATH_CONTRACT = {
  prefixes: ['frontend/src/', ...PROTECTED_GOVERNANCE_PREFIXES],
  exact: [...PROTECTED_GOVERNANCE_EXACT_PATHS],
  scriptSuffix: '.mjs',
};

export const GOVERNANCE_AUTHORITY_LABEL = 'i18n-governance-authority-change';

/** Canonical i18n relevance surface for required-check preclassification. */
export const I18N_RELEVANT_EXACT_PATHS = new Set(PROTECTED_GOVERNANCE_EXACT_PATHS);

export const EXIT_CODES = Object.freeze({
  PASS: 0,
  NEW_ACTIONABLE_HOST_DEBT: 2,
  GOVERNANCE_AUTHORITY_POLICY_FAILURE: 3,
  UNGOVERNED_OR_UNSUPPORTED_PATH: 4,
  INVALID_BASE_OR_GIT: 5,
});

const SUPPORTED_PRODUCTION_EXTENSIONS = new Set(['.ts', '.tsx']);
const UNSUPPORTED_PRODUCTION_EXTENSIONS = new Set(['.js', '.jsx']);
const INTENTIONALLY_EXCLUDED_REL_RE =
  /\.(test|spec)\.(ts|tsx)$|translations\/|legal-documents\.|hardcoded-copy-inventory|login-copy\.ts$|test-utils\.ts$/;
const INTENTIONALLY_EXCLUDED_DIR_RE = /\/(__tests__|node_modules)\//;

export function isIntentionallyExcludedFromGovernance(repoPath) {
  const rel = toSrcRelativePath(repoPath);
  if (!rel) return false;
  if (INTENTIONALLY_EXCLUDED_REL_RE.test(rel)) return true;
  if (INTENTIONALLY_EXCLUDED_DIR_RE.test(`/${rel}/`)) return true;
  return false;
}

export function isGovernanceAuthorityPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (I18N_RELEVANT_EXACT_PATHS.has(normalized)) return true;
  for (const prefix of PROTECTED_GOVERNANCE_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue;
    if (prefix === 'frontend/scripts/i18n-') {
      return normalized.endsWith('.mjs');
    }
    return true;
  }
  return false;
}

export function isI18nRelevantPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (isGovernanceAuthorityPath(repoPath)) return true;
  if (normalized.startsWith('frontend/src/')) return true;
  return false;
}

export function hasI18nRelevantChanges(changedPaths) {
  return changedPaths.some((repoPath) => isI18nRelevantPath(repoPath));
}

export function isFrontendSrcPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return normalized.startsWith('frontend/src/');
}

export function isGovernedProductionPath(repoPath) {
  return toSrcRelativePath(repoPath) !== null;
}

export function getProductionExtension(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const match = normalized.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

export function isUnsupportedProductionExtension(repoPath) {
  if (!isFrontendSrcPath(repoPath)) return false;
  const ext = getProductionExtension(repoPath);
  return UNSUPPORTED_PRODUCTION_EXTENSIONS.has(ext);
}

export function isSupportedProductionExtension(repoPath) {
  if (!isFrontendSrcPath(repoPath)) return false;
  const ext = getProductionExtension(repoPath);
  return SUPPORTED_PRODUCTION_EXTENSIONS.has(ext);
}

export function partitionChangedPaths(changedPaths, isScannerEligibleRelativePath) {
  const authorityPaths = [];
  const governedProductionPaths = [];
  const ungovernedProductionPaths = [];
  const unsupportedProductionPaths = [];
  const otherPaths = [];

  for (const repoPath of changedPaths) {
    if (isGovernanceAuthorityPath(repoPath)) {
      authorityPaths.push(repoPath);
      continue;
    }
    if (!isFrontendSrcPath(repoPath)) {
      otherPaths.push(repoPath);
      continue;
    }
    if (isUnsupportedProductionExtension(repoPath)) {
      unsupportedProductionPaths.push(repoPath);
      continue;
    }
    if (!isSupportedProductionExtension(repoPath)) {
      otherPaths.push(repoPath);
      continue;
    }
    if (isIntentionallyExcludedFromGovernance(repoPath)) {
      otherPaths.push(repoPath);
      continue;
    }
    const rel = toSrcRelativePath(repoPath);
    if (!rel || !isScannerEligibleRelativePath(rel)) {
      ungovernedProductionPaths.push(repoPath);
      continue;
    }
    governedProductionPaths.push(repoPath);
  }

  return {
    authorityPaths: [...authorityPaths].sort(),
    governedProductionPaths: [...governedProductionPaths].sort(),
    ungovernedProductionPaths: [...ungovernedProductionPaths].sort(),
    unsupportedProductionPaths: [...unsupportedProductionPaths].sort(),
    otherPaths: [...otherPaths].sort(),
  };
}

export function evaluateGovernanceAuthorityPolicy({
  authorityPaths,
  governedProductionPaths,
  authorityApproved,
}) {
  const governanceAuthorityChanged = authorityPaths.length > 0;
  const mixedAuthorityProductChange =
    governanceAuthorityChanged && governedProductionPaths.length > 0;

  if (mixedAuthorityProductChange) {
    return {
      ok: false,
      exitCode: EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE,
      governanceAuthorityChanged,
      mixedAuthorityProductChange: true,
      authorityApproved,
      reason: 'MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE',
    };
  }

  if (governanceAuthorityChanged && !authorityApproved) {
    return {
      ok: false,
      exitCode: EXIT_CODES.GOVERNANCE_AUTHORITY_POLICY_FAILURE,
      governanceAuthorityChanged,
      mixedAuthorityProductChange: false,
      authorityApproved,
      reason: 'GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL',
    };
  }

  return {
    ok: true,
    exitCode: EXIT_CODES.PASS,
    governanceAuthorityChanged,
    mixedAuthorityProductChange: false,
    authorityApproved,
    reason: governanceAuthorityChanged
      ? 'GOVERNANCE_AUTHORITY_APPROVED'
      : 'NO_GOVERNANCE_AUTHORITY_CHANGE',
  };
}
