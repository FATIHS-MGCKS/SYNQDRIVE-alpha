import { readFileSync } from 'node:fs';
import { normalizeRepoPath } from './git-diff.mjs';
import {
  CANONICAL_GOVERNANCE_EXACT_PATHS,
  CANONICAL_GOVERNANCE_PREFIX_RULES,
  isCanonicalGovernanceAuthorityPath,
  TRUSTED_WORKFLOW_ONLY_AUTHORITY_RULES,
} from './authority-path-contract.mjs';

/**
 * Deliberately narrow structural parser for trusted is_authority_path() grammar.
 * Parses workflow YAML text only — no eval, no execution, no handwritten mirror.
 */

const AUTHORITY_FN_MARKER = 'is_authority_path() {';
const CASE_HEADER = 'case "$path" in';

export const BOOTSTRAP_SAFE_NEUTRAL_EXACT_PATHS = [
  '.cursor/scripts/i18n-authority-protection-classifier.harness.sh',
  'architecture/I18N_GOVERNANCE_AUTHORITY_PATH_CONTRACT_PARITY_2026-09-09.md',
  'architecture/I18N_GOVERNANCE_WORKFLOW_AUTHORITY_PROTECTION_P2_3_4_2026-09-01.md',
];

export const BOOTSTRAP_SAFE_NEUTRAL_PREFIXES = [];

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

function stripLineComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
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
 * Parse supported grammar only:
 * PATTERN[|PATTERN...])
 *   return 0|1
 *   ;;
 */
export function parseAuthorityCaseBody(caseBody) {
  const cleaned = stripLineComments(caseBody);
  const arms = [];
  const structuralErrors = [];
  let position = 0;

  while (position < cleaned.length) {
    const leadingWhitespace = cleaned.slice(position).match(/^\s*/);
    position += leadingWhitespace?.[0]?.length ?? 0;
    if (position >= cleaned.length) {
      break;
    }

    const closeParenIndex = cleaned.indexOf(')', position);
    if (closeParenIndex < 0) {
      structuralErrors.push({
        fragment: cleaned.slice(position).trim(),
        reason: 'unparsed case arm fragment: missing pattern terminator )',
      });
      break;
    }

    const patternSegment = cleaned.slice(position, closeParenIndex);
    if (patternSegment.includes('\n')) {
      structuralErrors.push({
        fragment: patternSegment.trim(),
        reason: 'unsupported case arm layout: pattern spans multiple lines',
      });
      break;
    }

    const patterns = patternSegment
      .trim()
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);

    if (patterns.length === 0) {
      structuralErrors.push({
        fragment: patternSegment.trim(),
        reason: 'empty case arm pattern list',
      });
      break;
    }

    position = closeParenIndex + 1;

    if (cleaned[position] !== '\n') {
      structuralErrors.push({
        fragment: cleaned.slice(closeParenIndex, closeParenIndex + 40).trim(),
        reason: 'unsupported same-line case arm body; newline required after pattern)',
      });
      break;
    }

    position += 1;
    const afterPatternNewlineWs = cleaned.slice(position).match(/^\s*/);
    position += afterPatternNewlineWs?.[0]?.length ?? 0;

    const returnMatch = cleaned.slice(position).match(/^return\s+(0|1)(?:;)?/);
    if (!returnMatch) {
      structuralErrors.push({
        fragment: cleaned.slice(position, position + 120).trim(),
        reason: 'unsupported case arm body: expected return 0|1 immediately after pattern line',
      });
      break;
    }

    const returnCode = Number(returnMatch[1]);
    position += returnMatch[0].length;

    if (cleaned[position] !== '\n') {
      structuralErrors.push({
        fragment: cleaned.slice(position, position + 40).trim(),
        reason: 'unsupported same-line case arm terminator; newline required after return',
      });
      break;
    }

    position += 1;
    const afterReturnNewlineWs = cleaned.slice(position).match(/^\s*/);
    position += afterReturnNewlineWs?.[0]?.length ?? 0;

    if (!cleaned.slice(position).startsWith(';;')) {
      structuralErrors.push({
        fragment: cleaned.slice(position, position + 40).trim(),
        reason: 'unsupported case arm terminator: expected ;;',
      });
      break;
    }

    position += 2;
    arms.push({ patterns, returnCode, order: arms.length });
  }

  const unconsumedFragment = cleaned.slice(position).trim();
  if (unconsumedFragment) {
    structuralErrors.push({
      fragment: unconsumedFragment,
      reason: 'unconsumed authority case body fragment',
    });
  }

  return {
    arms,
    structuralErrors,
    discoveredArms: arms.length + structuralErrors.length,
    parsedArms: arms.length,
    unconsumedFragments: unconsumedFragment ? [unconsumedFragment] : [],
  };
}

function findFunctionEnd(script, fnStart) {
  const openBrace = script.indexOf('{', fnStart);
  if (openBrace < 0) {
    return -1;
  }
  let depth = 0;
  for (let i = openBrace; i < script.length; i += 1) {
    const ch = script[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function parseExplicitDefaultReturn(script, esacEnd, fnEnd) {
  const afterEsac = script.slice(esacEnd + 'esac'.length, fnEnd);
  const defaultMatch = afterEsac.match(/^\s*return\s+(0|1)(?:;)?\s*(?:\n|$)/);
  if (!defaultMatch) {
    return {
      defaultReturn: null,
      defaultReturnExplicit: false,
      error: 'missing explicit trailing default return after esac',
    };
  }

  const trailingTail = afterEsac.slice(defaultMatch[0].length);
  const additionalReturn = trailingTail.match(/^\s*return\s+(0|1)(?:;)?/m);
  if (additionalReturn) {
    return {
      defaultReturn: Number(defaultMatch[1]),
      defaultReturnExplicit: false,
      error: 'ambiguous trailing default return after esac',
    };
  }

  const defaultReturn = Number(defaultMatch[1]);
  if (defaultReturn !== 1) {
    return {
      defaultReturn,
      defaultReturnExplicit: false,
      error: `unsupported trailing default return ${defaultReturn}; expected exactly 1`,
    };
  }

  return {
    defaultReturn,
    defaultReturnExplicit: true,
    error: null,
  };
}

export function parseWorkflowAuthorityContract(workflowYaml) {
  const script = resolveWorkflowScript(workflowYaml);
  const fnStart = script.indexOf(AUTHORITY_FN_MARKER);
  if (fnStart < 0) {
    throw new Error('is_authority_path() not found in workflow run script');
  }

  const caseStart = script.indexOf(CASE_HEADER, fnStart);
  const esacEnd = script.indexOf('esac', caseStart);
  if (caseStart < 0 || esacEnd < 0) {
    throw new Error('is_authority_path() case statement not found');
  }

  const fnEnd = findFunctionEnd(script, fnStart);
  if (fnEnd < 0) {
    throw new Error('is_authority_path() function body terminator not found');
  }

  const caseBody = script.slice(caseStart + CASE_HEADER.length, esacEnd);
  const caseParse = parseAuthorityCaseBody(caseBody);
  const defaultParse = parseExplicitDefaultReturn(script, esacEnd, fnEnd);

  const unsupportedPatterns = [];
  for (const arm of caseParse.arms) {
    if (arm.returnCode !== 0 && arm.returnCode !== 1) {
      unsupportedPatterns.push({
        patterns: arm.patterns,
        reason: `unsupported return code ${arm.returnCode}`,
      });
    }
    for (const pattern of arm.patterns) {
      const syntax = validateWorkflowPatternSyntax(pattern);
      if (!syntax.ok) {
        unsupportedPatterns.push({ pattern, reason: syntax.reason });
      }
    }
  }

  const structuralCompletenessErrors = [
    ...caseParse.structuralErrors,
    ...(defaultParse.error ? [{ reason: defaultParse.error }] : []),
  ];

  const authorityPatterns = [
    ...new Set(
      caseParse.arms.filter((arm) => arm.returnCode === 0).flatMap((arm) => arm.patterns),
    ),
  ];

  const explicitNonAuthorityPatterns = [
    ...new Set(
      caseParse.arms.filter((arm) => arm.returnCode === 1).flatMap((arm) => arm.patterns),
    ),
  ];

  const ok =
    structuralCompletenessErrors.length === 0 &&
    unsupportedPatterns.length === 0 &&
    caseParse.arms.length > 0 &&
    defaultParse.defaultReturnExplicit === true;

  return {
    arms: caseParse.arms,
    authorityPatterns,
    explicitNonAuthorityPatterns,
    defaultReturn: defaultParse.defaultReturn,
    defaultReturnExplicit: defaultParse.defaultReturnExplicit,
    unsupportedPatterns,
    structuralCompletenessErrors,
    structural: {
      discoveredArms: caseParse.arms.length,
      parsedArms: caseParse.parsedArms,
      unconsumedFragments: caseParse.unconsumedFragments,
      armOrder: caseParse.arms.map((arm) => arm.patterns.join('|')),
    },
    ok,
  };
}

export function assertWorkflowAuthorityContractValid(contract) {
  if (!contract?.ok) {
    const details = {
      unsupportedPatterns: contract?.unsupportedPatterns ?? [],
      structuralCompletenessErrors: contract?.structuralCompletenessErrors ?? [],
      defaultReturn: contract?.defaultReturn ?? null,
      defaultReturnExplicit: contract?.defaultReturnExplicit ?? false,
      structural: contract?.structural ?? null,
    };
    throw new Error(`Invalid workflow authority contract: ${JSON.stringify(details, null, 2)}`);
  }
  if (!contract.arms?.length) {
    throw new Error('Workflow authority contract has no parsed case arms');
  }
  if (!contract.defaultReturnExplicit || contract.defaultReturn !== 1) {
    throw new Error('Workflow authority contract requires explicit trailing default return 1');
  }
  return contract;
}

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

export function evaluatePathAuthoritySemantics(repoPath, contract) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) {
    return {
      matched: false,
      authority: contract.defaultReturn === 0,
      matchedArm: null,
    };
  }

  for (const arm of contract.arms) {
    for (const pattern of arm.patterns) {
      if (matchesParsedWorkflowCasePattern(normalized, pattern)) {
        return {
          matched: true,
          authority: arm.returnCode === 0,
          matchedArm: arm,
        };
      }
    }
  }

  return {
    matched: false,
    authority: contract.defaultReturn === 0,
    matchedArm: null,
  };
}

export function isParsedWorkflowAuthorityPath(repoPath, contractOrPatterns) {
  const contract = assertWorkflowAuthorityContractValid(normalizeContractInput(contractOrPatterns));
  return evaluatePathAuthoritySemantics(repoPath, contract).authority;
}

export function isParsedWorkflowProductOrPresentationPath(repoPath, contractOrPatterns) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized.startsWith('frontend/src/')) return false;
  return !isParsedWorkflowAuthorityPath(normalized, contractOrPatterns);
}

function contractFromAuthorityPatterns(patterns, defaultReturn = 1) {
  return {
    arms: patterns.map((pattern, order) => ({
      patterns: [pattern],
      returnCode: 0,
      order,
    })),
    authorityPatterns: [...patterns],
    explicitNonAuthorityPatterns: [],
    defaultReturn,
    defaultReturnExplicit: true,
    unsupportedPatterns: [],
    structuralCompletenessErrors: [],
    structural: {
      discoveredArms: patterns.length,
      parsedArms: patterns.length,
      unconsumedFragments: [],
      armOrder: patterns,
    },
    ok: true,
  };
}

function normalizeContractInput(contractOrPatterns) {
  if (Array.isArray(contractOrPatterns)) {
    return contractFromAuthorityPatterns(contractOrPatterns);
  }
  return contractOrPatterns;
}

export function buildSyntheticOrderedContract(armDefs, defaultReturn = 1) {
  const arms = armDefs.map((def, order) => ({
    patterns: def.patterns,
    returnCode: def.returnCode,
    order,
  }));
  return assertWorkflowAuthorityContractValid({
    arms,
    authorityPatterns: arms
      .filter((arm) => arm.returnCode === 0)
      .flatMap((arm) => arm.patterns),
    explicitNonAuthorityPatterns: arms
      .filter((arm) => arm.returnCode === 1)
      .flatMap((arm) => arm.patterns),
    defaultReturn,
    defaultReturnExplicit: true,
    unsupportedPatterns: [],
    structuralCompletenessErrors: [],
    structural: {
      discoveredArms: arms.length,
      parsedArms: arms.length,
      unconsumedFragments: [],
      armOrder: arms.map((arm) => arm.patterns.join('|')),
    },
    ok: true,
  });
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

export function loadParsedWorkflowAuthorityPatterns(workflowPathOrYaml) {
  return loadParsedWorkflowAuthorityContract(workflowPathOrYaml).authorityPatterns;
}

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
    /(frontend\/scripts\/i18n-\*\.mjs\)\s*\n\s+)return 0(\s*\n)/,
    '$1return 1$2',
  );
}

export function mutateWorkflowYamlSameLineCaseArm(workflowYaml) {
  return workflowYaml.replace(
    /frontend\/scripts\/i18n-\*\.mjs\)\s*\n\s+return 0\s*\n\s+;;/,
    'frontend/scripts/i18n-alt-*.mjs) return 0 ;;',
  );
}

export function mutateWorkflowYamlUnexpectedCommandBeforeReturn(workflowYaml) {
  return workflowYaml.replace(
    /(frontend\/scripts\/i18n-\*\.mjs\)\s*\n)(\s+return 0\s*\n\s+;;)/,
    '$1                echo "unexpected"\n$2',
  );
}

export function mutateWorkflowYamlUnrecognizedArmLayout(workflowYaml) {
  return workflowYaml.replace(
    /(frontend\/scripts\/i18n-\*\.mjs\)\s*\n\s+return 0\s*\n\s+;;)/,
    '$1\n              alt-arm)\n                return 0\n                ;&',
  );
}

export function mutateWorkflowYamlDefaultReturnZero(workflowYaml) {
  return workflowYaml.replace(
    /(\s+esac\s*\n\s+)return 1(\s*\n)/,
    '$1return 0$2',
  );
}

export function mutateWorkflowYamlRemoveDefaultReturn(workflowYaml) {
  return workflowYaml.replace(/\s+return 1\s*\n(\s+}\s*\n\s+is_product_or_presentation_path)/, '\n$1');
}

export function mutateWorkflowContractInvertAuthorityReturn(contract) {
  return {
    ...contract,
    arms: contract.arms.map((arm) =>
      arm.patterns.includes('frontend/scripts/i18n-*.mjs')
        ? { ...arm, returnCode: 1 }
        : arm,
    ),
    authorityPatterns: contract.authorityPatterns.filter(
      (pattern) => pattern !== 'frontend/scripts/i18n-*.mjs',
    ),
    explicitNonAuthorityPatterns: [
      ...new Set([...contract.explicitNonAuthorityPatterns, 'frontend/scripts/i18n-*.mjs']),
    ],
  };
}
