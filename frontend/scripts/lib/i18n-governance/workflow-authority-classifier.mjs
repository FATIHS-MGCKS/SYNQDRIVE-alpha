import { readFileSync } from 'node:fs';
import { normalizeRepoPath } from './git-diff.mjs';
import {
  CANONICAL_GOVERNANCE_EXACT_PATHS,
  CANONICAL_GOVERNANCE_PREFIX_RULES,
  isCanonicalGovernanceAuthorityPath,
  matchesPrefixRule,
  TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES,
} from './authority-path-contract.mjs';

/**
 * Parse the inline is_authority_path() bash case statement from the trusted
 * workflow YAML and evaluate paths using extracted shell-case semantics.
 *
 * Does NOT execute workflow code. Does NOT maintain a handwritten classifier
 * mirror — patterns are derived from the actual YAML text only.
 */

const AUTHORITY_FN_MARKER = 'is_authority_path() {';

export function extractWorkflowRunScript(workflowYaml) {
  const runMatch = workflowYaml.match(
    /- name: Evaluate trusted governance authority protection[\s\S]*?\n\s+run: \|\n([\s\S]*?)(?=\n\s{6}[a-zA-Z#-]|\n\s{4}[a-zA-Z#-]|\n\s{2}[a-zA-Z#-]|$)/,
  );
  if (!runMatch?.[1]) {
    throw new Error('Unable to locate authority-protection workflow run script');
  }
  return runMatch[1].replace(/^\s{10}/gm, '');
}

export function extractIsAuthorityPathCasePatterns(workflowYaml) {
  const runScript = typeof workflowYaml === 'string' && workflowYaml.includes('is_authority_path()')
    ? workflowYaml.includes('run: |')
      ? extractWorkflowRunScript(workflowYaml)
      : workflowYaml
    : readFileSync(workflowYaml, 'utf8');

  const script = runScript.includes(AUTHORITY_FN_MARKER)
    ? runScript
    : extractWorkflowRunScript(runScript);

  const fnStart = script.indexOf(AUTHORITY_FN_MARKER);
  if (fnStart < 0) {
    throw new Error('is_authority_path() not found in workflow run script');
  }

  const caseStart = script.indexOf('case "$path" in', fnStart);
  const esacEnd = script.indexOf('esac', caseStart);
  if (caseStart < 0 || esacEnd < 0) {
    throw new Error('is_authority_path() case statement not found');
  }

  const caseBody = script.slice(caseStart, esacEnd);
  const patterns = [];
  const armRegex = /^\s+([^)\n]+)\)/gm;
  let match = armRegex.exec(caseBody);
  while (match) {
    const arm = match[1].trim();
    for (const part of arm.split('|')) {
      const pattern = part.trim();
      if (pattern) patterns.push(pattern);
    }
    match = armRegex.exec(caseBody);
  }

  if (patterns.length === 0) {
    throw new Error('No authority case patterns extracted from workflow');
  }

  return [...new Set(patterns)];
}

/** Convert bash case glob to anchored RegExp (no path separator special-casing). */
export function bashCasePatternToRegExp(pattern) {
  let regex = '^';
  for (let i = 0; i < pattern.length; i++) {
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

export function matchesParsedWorkflowCasePattern(repoPath, pattern) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return false;
  return bashCasePatternToRegExp(pattern).test(normalized);
}

export function isParsedWorkflowAuthorityPath(repoPath, patterns) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return false;
  return patterns.some((pattern) => matchesParsedWorkflowCasePattern(normalized, pattern));
}

export function isParsedWorkflowProductOrPresentationPath(repoPath, patterns) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized.startsWith('frontend/src/')) return false;
  return !isParsedWorkflowAuthorityPath(normalized, patterns);
}

function matchesWorkflowOnlyRule(normalizedPath) {
  return TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES.some(
    (rule) => rule.type === 'prefix' && normalizedPath.startsWith(rule.prefix),
  );
}

function isLiteralPattern(pattern) {
  return !pattern.includes('*') && !pattern.includes('?');
}

function patternCoversCanonicalPrefixRule(pattern, rule) {
  const witnessStem = '__parity_prefix_witness__';
  const positive = `${rule.prefix}${witnessStem}${rule.extension ?? ''}`;
  const negative = rule.extension
    ? `${rule.prefix}${witnessStem}.wrongext`
    : `${rule.prefix}extra/nested/file.mjs`;

  const positiveMatches = matchesParsedWorkflowCasePattern(positive, pattern);
  if (!positiveMatches) return false;
  if (rule.extension) {
    return !matchesParsedWorkflowCasePattern(negative, pattern);
  }
  return true;
}

/**
 * Structural parity between canonical contract and ACTUAL parsed workflow patterns.
 */
export function analyzeParsedWorkflowCanonicalParity(patterns) {
  const canonicalOnly = [];
  const unexplainedWorkflowExact = [];
  const prefixMismatches = [];

  for (const path of CANONICAL_GOVERNANCE_EXACT_PATHS) {
    if (!isParsedWorkflowAuthorityPath(path, patterns)) {
      canonicalOnly.push(path);
    }
  }

  for (const pattern of patterns) {
    if (!isLiteralPattern(pattern)) continue;
    const path = normalizeRepoPath(pattern);
    if (isCanonicalGovernanceAuthorityPath(path)) continue;
    if (matchesWorkflowOnlyRule(path)) continue;
    unexplainedWorkflowExact.push(path);
  }

  for (const rule of CANONICAL_GOVERNANCE_PREFIX_RULES) {
    const coveringPatterns = patterns.filter((pattern) => patternCoversCanonicalPrefixRule(pattern, rule));
    if (coveringPatterns.length === 0) {
      prefixMismatches.push({
        rule,
        reason: 'no parsed workflow pattern with equivalent prefix/extension semantics',
      });
    }
  }

  return {
    canonicalOnly: [...new Set(canonicalOnly)].sort(),
    unexplainedWorkflowExact: [...new Set(unexplainedWorkflowExact)].sort(),
    prefixMismatches,
  };
}

export function classifyPathsWithParsedWorkflow(patterns, paths) {
  const authorityPaths = [];
  const productPaths = [];
  const otherPaths = [];

  for (const rawPath of paths) {
    const path = normalizeRepoPath(rawPath);
    if (isParsedWorkflowAuthorityPath(path, patterns)) {
      authorityPaths.push(path);
      continue;
    }
    if (path.startsWith('frontend/src/')) {
      productPaths.push(path);
      continue;
    }
    otherPaths.push(path);
  }

  return {
    authorityPaths: [...authorityPaths].sort(),
    productPaths: [...productPaths].sort(),
    otherPaths: [...otherPaths].sort(),
  };
}

export function loadParsedWorkflowAuthorityPatterns(workflowPathOrYaml) {
  const yaml =
    typeof workflowPathOrYaml === 'string' && workflowPathOrYaml.includes('is_authority_path()')
      ? workflowPathOrYaml
      : readFileSync(workflowPathOrYaml, 'utf8');
  return extractIsAuthorityPathCasePatterns(yaml);
}

export function assertWorkflowYamlSecurityInvariants(workflowYaml) {
  if (/uses:\s*actions\/checkout/.test(workflowYaml)) {
    throw new Error('i18n-authority-protection workflow must not checkout PR head');
  }
  if (/source\s+\.github\/scripts\//.test(workflowYaml) || /bash\s+\.github\/scripts\//.test(workflowYaml)) {
    throw new Error('i18n-authority-protection workflow must not source repository runtime helpers');
  }
}

/** Expected trusted-workflow authority = canonical + documented workflow-only rules. */
export function isExpectedTrustedWorkflowAuthorityPath(repoPath, patterns) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return false;
  if (matchesWorkflowOnlyRule(normalized)) return true;
  if (isCanonicalGovernanceAuthorityPath(normalized)) {
    return isParsedWorkflowAuthorityPath(normalized, patterns);
  }
  return isParsedWorkflowAuthorityPath(normalized, patterns);
}

export function analyzeExpectedVsParsedWorkflowParity(patterns, samplePaths) {
  const workflowOnly = [];
  const canonicalOnly = [];
  const semanticDifferences = [];

  for (const rawPath of samplePaths) {
    const path = normalizeRepoPath(rawPath);
    const canonical = isCanonicalGovernanceAuthorityPath(path);
    const parsed = isParsedWorkflowAuthorityPath(path, patterns);

    if (parsed && !canonical) {
      if (matchesWorkflowOnlyRule(path)) {
        workflowOnly.push(path);
      } else {
        semanticDifferences.push({ path, canonical, parsed, kind: 'PARSED_NOT_CANONICAL' });
      }
      continue;
    }

    if (canonical && !parsed) {
      canonicalOnly.push(path);
    }
  }

  return {
    workflowOnly: [...new Set(workflowOnly)].sort(),
    canonicalOnly: [...new Set(canonicalOnly)].sort(),
    semanticDifferences,
  };
}

export const SYNTHETIC_BOUNDARY_WITNESSES = [
  {
    path: 'frontend/scripts/i18n-future-check.mjs',
    canonical: true,
    parsed: true,
    product: false,
  },
  {
    path: 'frontend/scripts/i18n-future-check.ts',
    canonical: false,
    parsed: false,
    product: false,
  },
  {
    path: 'frontend/scripts/i18n-future-check.js',
    canonical: false,
    parsed: false,
    product: false,
  },
  {
    path: 'frontend/scripts/not-i18n-future-check.mjs',
    canonical: false,
    parsed: false,
    product: false,
  },
  {
    path: 'frontend/scripts/lib/i18n-governance/future-policy.mjs',
    canonical: true,
    parsed: true,
    product: false,
  },
  {
    path: 'frontend/src/rental/components/Future.tsx',
    canonical: false,
    parsed: false,
    product: true,
  },
  {
    path: 'frontend/src/i18n/translation-coverage-baseline.json',
    canonical: true,
    parsed: true,
    product: false,
  },
  {
    path: 'frontend/src/i18n/translation-coverage.test.ts',
    canonical: true,
    parsed: true,
    product: false,
  },
  {
    path: 'frontend/src/i18n/i18n-structural-check.test.ts',
    canonical: true,
    parsed: true,
    product: false,
  },
  {
    path: '.cursor/rules/i18n.mdc',
    canonical: true,
    parsed: true,
    product: false,
  },
  {
    path: 'AGENTS.md',
    canonical: true,
    parsed: true,
    product: false,
  },
  {
    path: '.github/workflows/future-workflow.yml',
    canonical: false,
    parsed: true,
    workflowOnly: true,
    product: false,
  },
];

export function evaluateSyntheticBoundaryWitnesses(patterns) {
  return SYNTHETIC_BOUNDARY_WITNESSES.map((witness) => {
    const path = witness.path;
    const canonical = isCanonicalGovernanceAuthorityPath(path);
    const parsed = isParsedWorkflowAuthorityPath(path, patterns);
    const product = isParsedWorkflowProductOrPresentationPath(path, patterns);
    return {
      ...witness,
      observed: { canonical, parsed, product },
      ok:
        canonical === witness.canonical &&
        parsed === witness.parsed &&
        product === witness.product,
    };
  });
}

export function mutatePatternsReplaceWildcardWithExactList(patterns) {
  return patterns.flatMap((pattern) => {
    if (pattern === 'frontend/scripts/i18n-*.mjs') {
      return [
        'frontend/scripts/i18n-hardcoded-scan.mjs',
        'frontend/scripts/i18n-check.mjs',
        'frontend/scripts/i18n-governance.mjs',
        'frontend/scripts/i18n-pr-gate.mjs',
        'frontend/scripts/i18n-shim-inventory.mjs',
      ];
    }
    return [pattern];
  });
}

export function mutatePatternsBroadenI18nScriptWildcard(patterns) {
  return patterns.map((pattern) =>
    pattern === 'frontend/scripts/i18n-*.mjs' ? 'frontend/scripts/i18n-*' : pattern,
  );
}
