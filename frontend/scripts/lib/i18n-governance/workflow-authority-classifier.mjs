import { readFileSync } from 'node:fs';
import { normalizeRepoPath } from './git-diff.mjs';
import {
  CANONICAL_GOVERNANCE_EXACT_PATHS,
  CANONICAL_GOVERNANCE_PREFIX_RULES,
  isCanonicalGovernanceAuthorityPath,
  TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES,
} from './authority-path-contract.mjs';

/**
 * Parse the inline is_authority_path() bash case statement from the trusted
 * workflow YAML and evaluate paths using extracted shell-case semantics.
 *
 * Does NOT execute workflow code. Does NOT maintain a handwritten classifier
 * mirror — case arms and return semantics are derived from YAML text only.
 */

const AUTHORITY_FN_MARKER = 'is_authority_path() {';

/** Non-authority paths allowed in governance PRs without triggering mixed-change. */
export const BOOTSTRAP_SAFE_NEUTRAL_EXACT_PATHS = [
  '.cursor/scripts/i18n-authority-protection-classifier.harness.sh',
];

export const BOOTSTRAP_SAFE_NEUTRAL_PREFIXES = ['architecture/'];

const UNSUPPORTED_PATTERN_CHAR_RE = /[\[\]{}!@#$%^&=+~`'"\\]/;

export function extractWorkflowRunScript(workflowYaml) {
  const runMatch = workflowYaml.match(
    /- name: Evaluate trusted governance authority protection[\s\S]*?\n\s+run: \|\n([\s\S]*?)(?=\n\s{6}[a-zA-Z#-]|\n\s{4}[a-zA-Z#-]|\n\s{2}[a-zA-Z#-]|$)/,
  );
  if (!runMatch?.[1]) {
    throw new Error('Unable to locate authority-protection workflow run script');
  }
  return runMatch[1].replace(/^\s{10}/gm, '');
}

function resolveWorkflowScript(workflowYaml) {
  const input =
    typeof workflowYaml === 'string' && workflowYaml.includes('is_authority_path()')
      ? workflowYaml.includes('run: |')
        ? extractWorkflowRunScript(workflowYaml)
        : workflowYaml
      : readFileSync(workflowYaml, 'utf8');

  return input.includes(AUTHORITY_FN_MARKER) ? input : extractWorkflowRunScript(input);
}

export function validateWorkflowPatternSyntax(pattern) {
  const normalized = String(pattern ?? '').trim();
  if (!normalized) {
    return { ok: false, reason: 'empty pattern' };
  }
  if (UNSUPPORTED_PATTERN_CHAR_RE.test(normalized)) {
    return { ok: false, reason: 'unsupported shell case pattern syntax' };
  }
  if (normalized.includes('**')) {
    return { ok: false, reason: 'unsupported double-glob syntax' };
  }
  return { ok: true, reason: null };
}

/**
 * Parse is_authority_path() case arms including per-arm return semantics.
 * return 0 => authority; return 1 => explicit non-authority for matched patterns.
 */
export function parseWorkflowAuthorityContract(workflowYaml) {
  const script = resolveWorkflowScript(workflowYaml);
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
  const arms = [];
  const unsupported = [];
  const armRegex = /^\s+([^)\n]+)\)\s*\n\s+return\s+(\d+)\s*;/gm;
  let match = armRegex.exec(caseBody);
  while (match) {
    const patterns = match[1]
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const returnCode = Number(match[2]);
    if (returnCode !== 0 && returnCode !== 1) {
      unsupported.push({
        patterns,
        reason: `unsupported return code ${returnCode}`,
      });
    }
    for (const pattern of patterns) {
      const syntax = validateWorkflowPatternSyntax(pattern);
      if (!syntax.ok) {
        unsupported.push({ pattern, reason: syntax.reason });
      }
    }
    arms.push({ patterns, returnCode });
    match = armRegex.exec(caseBody);
  }

  if (arms.length === 0) {
    throw new Error('No authority case arms extracted from workflow');
  }

  const authorityPatterns = [
    ...new Set(
      arms.filter((arm) => arm.returnCode === 0).flatMap((arm) => arm.patterns),
    ),
  ];

  const explicitNonAuthorityPatterns = [
    ...new Set(
      arms.filter((arm) => arm.returnCode === 1).flatMap((arm) => arm.patterns),
    ),
  ];

  const trailingReturnMatch = script
    .slice(esacEnd)
    .match(/^\s*return\s+(\d+)\s*;/m);
  const defaultReturn = trailingReturnMatch ? Number(trailingReturnMatch[1]) : 1;

  return {
    arms,
    authorityPatterns,
    explicitNonAuthorityPatterns,
    defaultReturn,
    unsupportedPatterns: unsupported,
    ok: unsupported.length === 0,
  };
}

export function assertWorkflowAuthorityContractValid(contract) {
  if (!contract?.ok) {
    throw new Error(
      `Unsupported workflow authority patterns: ${JSON.stringify(contract?.unsupportedPatterns ?? [], null, 2)}`,
    );
  }
  if (!contract.authorityPatterns?.length) {
    throw new Error('Workflow authority contract has no authority patterns');
  }
  return contract;
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
  const syntax = validateWorkflowPatternSyntax(pattern);
  if (!syntax.ok) {
    throw new Error(`Refusing to evaluate unsupported workflow pattern: ${pattern}`);
  }
  return bashCasePatternToRegExp(pattern).test(normalized);
}

export function isParsedWorkflowAuthorityPath(repoPath, contractOrPatterns) {
  const contract = normalizeContractInput(contractOrPatterns);
  assertWorkflowAuthorityContractValid(contract);
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) return false;

  for (const pattern of contract.explicitNonAuthorityPatterns) {
    if (matchesParsedWorkflowCasePattern(normalized, pattern)) {
      return false;
    }
  }

  return contract.authorityPatterns.some((pattern) =>
    matchesParsedWorkflowCasePattern(normalized, pattern),
  );
}

export function isParsedWorkflowProductOrPresentationPath(repoPath, contractOrPatterns) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized.startsWith('frontend/src/')) return false;
  return !isParsedWorkflowAuthorityPath(normalized, contractOrPatterns);
}

function normalizeContractInput(contractOrPatterns) {
  if (Array.isArray(contractOrPatterns)) {
    return {
      authorityPatterns: contractOrPatterns,
      explicitNonAuthorityPatterns: [],
      unsupportedPatterns: [],
      ok: true,
      arms: [],
      defaultReturn: 1,
    };
  }
  return contractOrPatterns;
}

function matchesWorkflowOnlyRule(normalizedPath) {
  return TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES.some(
    (rule) => rule.type === 'prefix' && normalizedPath.startsWith(rule.prefix),
  );
}

function isLiteralPattern(pattern) {
  return !pattern.includes('*') && !pattern.includes('?');
}

function isBootstrapNeutralPath(normalizedPath) {
  if (BOOTSTRAP_SAFE_NEUTRAL_EXACT_PATHS.includes(normalizedPath)) return true;
  return BOOTSTRAP_SAFE_NEUTRAL_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
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

export function analyzeParsedWorkflowCanonicalParity(contractOrPatterns) {
  const contract = assertWorkflowAuthorityContractValid(normalizeContractInput(contractOrPatterns));
  const patterns = contract.authorityPatterns;
  const canonicalOnly = [];
  const unexplainedWorkflowExact = [];
  const prefixMismatches = [];

  for (const path of CANONICAL_GOVERNANCE_EXACT_PATHS) {
    if (!isParsedWorkflowAuthorityPath(path, contract)) {
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
    contractOk: contract.ok,
  };
}

export function evaluateBootstrapSafety(contractOrPatterns, paths) {
  const contract = assertWorkflowAuthorityContractValid(normalizeContractInput(contractOrPatterns));
  const authorityPaths = [];
  const productPaths = [];
  const neutralPaths = [];
  const unrecognizedPaths = [];

  for (const rawPath of paths) {
    const path = normalizeRepoPath(rawPath);
    if (!path) continue;

    if (isParsedWorkflowAuthorityPath(path, contract)) {
      authorityPaths.push(path);
      continue;
    }

    if (path.startsWith('frontend/src/')) {
      productPaths.push(path);
      continue;
    }

    if (isBootstrapNeutralPath(path)) {
      neutralPaths.push(path);
      continue;
    }

    unrecognizedPaths.push(path);
  }

  const authorityChanged = authorityPaths.length > 0;
  const productOrPresentationChanged = productPaths.length > 0;
  const ok =
    authorityChanged &&
    !productOrPresentationChanged &&
    unrecognizedPaths.length === 0;

  return {
    ok,
    authorityChanged,
    productOrPresentationChanged,
    authorityPaths: [...authorityPaths].sort(),
    productPaths: [...productPaths].sort(),
    neutralPaths: [...neutralPaths].sort(),
    unrecognizedPaths: [...unrecognizedPaths].sort(),
  };
}

export function classifyPathsWithParsedWorkflow(contractOrPatterns, paths) {
  const evaluation = evaluateBootstrapSafety(contractOrPatterns, paths);
  return {
    authorityPaths: evaluation.authorityPaths,
    productPaths: evaluation.productPaths,
    otherPaths: [...evaluation.neutralPaths, ...evaluation.unrecognizedPaths].sort(),
    neutralPaths: evaluation.neutralPaths,
    unrecognizedPaths: evaluation.unrecognizedPaths,
  };
}

export function loadParsedWorkflowAuthorityContract(workflowPathOrYaml) {
  const yaml =
    typeof workflowPathOrYaml === 'string' && workflowPathOrYaml.includes('is_authority_path()')
      ? workflowPathOrYaml
      : readFileSync(workflowPathOrYaml, 'utf8');
  return assertWorkflowAuthorityContractValid(parseWorkflowAuthorityContract(yaml));
}

/** @deprecated Prefer loadParsedWorkflowAuthorityContract(). */
export function loadParsedWorkflowAuthorityPatterns(workflowPathOrYaml) {
  return loadParsedWorkflowAuthorityContract(workflowPathOrYaml).authorityPatterns;
}

/** @deprecated Prefer parseWorkflowAuthorityContract(). */
export function extractIsAuthorityPathCasePatterns(workflowYaml) {
  return loadParsedWorkflowAuthorityContract(workflowYaml).authorityPatterns;
}

export function assertWorkflowYamlSecurityInvariants(workflowYaml) {
  if (/uses:\s*actions\/checkout/.test(workflowYaml)) {
    throw new Error('i18n-authority-protection workflow must not checkout PR head');
  }
  if (/source\s+\.github\/scripts\//.test(workflowYaml) || /bash\s+\.github\/scripts\//.test(workflowYaml)) {
    throw new Error('i18n-authority-protection workflow must not source repository runtime helpers');
  }
}

export function analyzeExpectedVsParsedWorkflowParity(contractOrPatterns, samplePaths) {
  const contract = assertWorkflowAuthorityContractValid(normalizeContractInput(contractOrPatterns));
  const workflowOnly = [];
  const canonicalOnly = [];
  const semanticDifferences = [];

  for (const rawPath of samplePaths) {
    const path = normalizeRepoPath(rawPath);
    const canonical = isCanonicalGovernanceAuthorityPath(path);
    const parsed = isParsedWorkflowAuthorityPath(path, contract);

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
  { path: 'frontend/scripts/i18n-future-check.mjs', canonical: true, parsed: true, product: false },
  { path: 'frontend/scripts/i18n-future-check.ts', canonical: false, parsed: false, product: false },
  { path: 'frontend/scripts/i18n-future-check.js', canonical: false, parsed: false, product: false },
  { path: 'frontend/scripts/not-i18n-future-check.mjs', canonical: false, parsed: false, product: false },
  {
    path: 'frontend/scripts/lib/i18n-governance/future-policy.mjs',
    canonical: true,
    parsed: true,
    product: false,
  },
  { path: 'frontend/src/rental/components/Future.tsx', canonical: false, parsed: false, product: true },
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
  { path: '.cursor/rules/i18n.mdc', canonical: true, parsed: true, product: false },
  { path: 'AGENTS.md', canonical: true, parsed: true, product: false },
  {
    path: '.github/workflows/future-workflow.yml',
    canonical: false,
    parsed: true,
    workflowOnly: true,
    product: false,
  },
];

export function evaluateSyntheticBoundaryWitnesses(contractOrPatterns) {
  const contract = assertWorkflowAuthorityContractValid(normalizeContractInput(contractOrPatterns));
  return SYNTHETIC_BOUNDARY_WITNESSES.map((witness) => {
    const path = witness.path;
    const canonical = isCanonicalGovernanceAuthorityPath(path);
    const parsed = isParsedWorkflowAuthorityPath(path, contract);
    const product = isParsedWorkflowProductOrPresentationPath(path, contract);
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

export function mutateWorkflowYamlInsertUnsupportedPattern(workflowYaml) {
  return workflowYaml.replace(
    /frontend\/scripts\/i18n-\*\.mjs\)/,
    'frontend/scripts/i18n-[[:alnum:]]*.mjs)',
  );
}

export function mutateWorkflowYamlInvertAuthorityReturn(workflowYaml) {
  return workflowYaml.replace(
    /(frontend\/scripts\/i18n-\*\.mjs\)\s*\n\s+)return 0/,
    '$1return 1',
  );
}

export function mutateWorkflowContractInvertAuthorityReturn(contract) {
  const authorityPatterns = contract.authorityPatterns.filter(
    (pattern) => pattern !== 'frontend/scripts/i18n-*.mjs',
  );
  return {
    ...contract,
    authorityPatterns,
    explicitNonAuthorityPatterns: [
      ...new Set([...contract.explicitNonAuthorityPatterns, 'frontend/scripts/i18n-*.mjs']),
    ],
    arms: contract.arms.map((arm) =>
      arm.patterns.includes('frontend/scripts/i18n-*.mjs')
        ? { ...arm, returnCode: 1 }
        : arm,
    ),
  };
}
