/**
 * Bounded same-file presentation prop analysis (P2.3.2).
 * Traces local const/let assignments and conditional/template literals into
 * known presentation props without whole-program dataflow.
 */

import { extractStructuralContext } from './structural-context.mjs';

export const PRESENTATION_PROPS = new Set([
  'title',
  'aria-label',
  'aria-description',
  'placeholder',
  'alt',
]);

export const PRESENTATION_OBJECT_KEYS = new Set([
  'label',
  'title',
  'message',
  'description',
  'placeholder',
  'tooltip',
  'emptyText',
  'loadingText',
  'errorText',
]);

export const TOAST_API_RE = /\btoast(?:\.(?:success|error|info|warning|message))?\s*\(/g;

const STRING_LITERAL_RE = /^(['"`])([\s\S]*?)\1$/;
const TEMPLATE_LITERAL_RE = /^`([\s\S]*)`$/;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const MEMBER_EXPR_RE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;

const TRANSLATION_CALL_RE = /\b(?:t|dt|translateKey)\s*\(/;
const MACHINE_RESOLVER_RE = /\b(?:label|format|resolve)[A-Z][A-Za-z0-9]*\s*\(/;

export function isTranslationExpression(expr) {
  const trimmed = expr.trim();
  return TRANSLATION_CALL_RE.test(trimmed) || MACHINE_RESOLVER_RE.test(trimmed);
}

export function isRawDataExpression(expr) {
  const trimmed = expr.trim();
  if (MEMBER_EXPR_RE.test(trimmed)) {
    return /\.(message|name|license|vin|email|title|label|text|content|body|error|status|id|value)$/i.test(trimmed);
  }
  return false;
}

function unescapeStringLiteral(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

export function extractStringLiteral(expr) {
  const trimmed = expr.trim();
  const match = trimmed.match(STRING_LITERAL_RE);
  if (!match) return null;
  return unescapeStringLiteral(match[2]);
}

export function extractTemplateHostFraming(expr) {
  const trimmed = expr.trim();
  const match = trimmed.match(TEMPLATE_LITERAL_RE);
  if (!match) return null;
  const raw = match[1];
  const hostParts = raw
    .split(/\$\{[^}]+\}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (hostParts.length === 0) return null;
  return hostParts.join(' ').trim();
}

export function extractConditionalLiterals(expr) {
  const trimmed = expr.trim();
  const match = trimmed.match(/^(.*?)\?\s*(['"`][\s\S]*?|`.+?`)\s*:\s*(['"`][\s\S]*?|`.+?`)\s*$/);
  if (!match) return null;
  const left = extractStringLiteral(match[2].trim()) ?? extractTemplateHostFraming(match[2].trim());
  const right = extractStringLiteral(match[3].trim()) ?? extractTemplateHostFraming(match[3].trim());
  const parts = [left, right].filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function parseAssignmentRhs(rhs) {
  const trimmed = rhs.trim().replace(/,\s*$/, '');
  if (isTranslationExpression(trimmed) || isRawDataExpression(trimmed)) {
    return { kind: 'safe', value: null };
  }
  const conditional = extractConditionalLiterals(trimmed);
  if (conditional) {
    return { kind: 'literal', value: conditional.join(' / ') };
  }
  const template = extractTemplateHostFraming(trimmed);
  if (template) {
    return { kind: 'template', value: template };
  }
  const literal = extractStringLiteral(trimmed);
  if (literal !== null) {
    return { kind: 'literal', value: literal };
  }
  if (IDENT_RE.test(trimmed)) {
    return { kind: 'ref', ref: trimmed };
  }
  return { kind: 'unknown', value: null };
}

export function buildLocalBindingMap(source) {
  const bindings = new Map();
  const assignRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/g;
  let match;
  while ((match = assignRe.exec(source)) !== null) {
    const name = match[1];
    const rhs = match[2];
    const line = source.slice(0, match.index).split('\n').length;
    const column = match.index - source.lastIndexOf('\n', match.index);
    bindings.set(name, {
      name,
      line,
      column,
      ...parseAssignmentRhs(rhs),
      rhs: rhs.trim(),
    });
  }
  return bindings;
}

function resolveBinding(name, bindings, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const binding = bindings.get(name);
  if (!binding) return null;
  if (binding.kind === 'literal' || binding.kind === 'template') {
    return binding.value;
  }
  if (binding.kind === 'ref') {
    return resolveBinding(binding.ref, bindings, seen);
  }
  if (binding.kind === 'safe' || binding.kind === 'unknown') {
    return null;
  }
  return null;
}

export function collectIndirectPresentationFindings(filePath, source, options) {
  const { isLikelyUserCopy, classifySurface, classifyRentalModule, isEnforcedCleanSurface, migrationPhaseFor } =
    options;
  const relPath = filePath.replace(/\\/g, '/');
  const surface = classifySurface({ relPath });
  const module = surface === 'RENTAL' ? classifyRentalModule(relPath) : null;
  const bindings = buildLocalBindingMap(source);
  const findings = [];

  const propUsageRe =
    /\b(title|aria-label|aria-description|placeholder|alt)\s*=\s*\{([^}]+)\}/g;
  let propMatch;
  while ((propMatch = propUsageRe.exec(source)) !== null) {
    const presentationOwner = propMatch[1];
    const expr = propMatch[2].trim();
    const line = source.slice(0, propMatch.index).split('\n').length;
    const column = propMatch.index - source.lastIndexOf('\n', propMatch.index);

    if (isTranslationExpression(expr) || isRawDataExpression(expr)) continue;

    let sample = null;
    let kind = 'INDIRECT_PROP';

    const directLiteral = extractStringLiteral(expr);
    if (directLiteral !== null) {
      sample = directLiteral;
      kind = 'DIRECT_PROP';
    } else {
      const conditional = extractConditionalLiterals(expr);
      if (conditional) {
        sample = conditional.join(' / ');
        kind = 'CONDITIONAL_PROP';
      } else {
        const template = extractTemplateHostFraming(expr);
        if (template) {
          sample = template;
          kind = 'TEMPLATE_PROP';
        } else if (IDENT_RE.test(expr)) {
          sample = resolveBinding(expr, bindings);
          kind = 'INDIRECT_PROP';
        }
      }
    }

    if (!sample || !isLikelyUserCopy(sample)) continue;

    findings.push({
      file: relPath,
      line,
      column,
      surface,
      module,
      category: presentationOwner === 'title' ? 'TITLE' : presentationOwner === 'placeholder' ? 'PLACEHOLDER' : 'ARIA',
      presentationOwner,
      kind,
      sample: sample.slice(0, 120),
      severity: isEnforcedCleanSurface(surface, relPath) ? 'enforce-clean' : 'debt',
      migrationPhase: migrationPhaseFor(relPath, surface),
      structuralContext: extractStructuralContext(source, propMatch.index),
    });
  }

  const objectLiteralRe =
    /\{[^{}]*\b(label|title|message|description|placeholder|tooltip|emptyText|loadingText|errorText)\s*:\s*(['"`][\s\S]*?|`.+?`)/g;
  let objMatch;
  while ((objMatch = objectLiteralRe.exec(source)) !== null) {
    const key = objMatch[1];
    const literalExpr = objMatch[2];
    const line = source.slice(0, objMatch.index).split('\n').length;
    const sample =
      extractStringLiteral(literalExpr) ?? extractTemplateHostFraming(literalExpr) ?? extractConditionalLiterals(literalExpr)?.join(' / ');
    if (!sample || !isLikelyUserCopy(sample)) continue;
    findings.push({
      file: relPath,
      line,
      column: objMatch.index - source.lastIndexOf('\n', objMatch.index),
      surface,
      module,
      category: 'CONFIG_LABEL',
      presentationOwner: key,
      kind: 'CONFIG_OBJECT',
      sample: sample.slice(0, 120),
      severity: isEnforcedCleanSurface(surface, relPath) ? 'enforce-clean' : 'debt',
      migrationPhase: migrationPhaseFor(relPath, surface),
      structuralContext: extractStructuralContext(source, objMatch.index),
    });
  }

  let toastMatch;
  while ((toastMatch = TOAST_API_RE.exec(source)) !== null) {
    const after = source.slice(toastMatch.index + toastMatch[0].length);
    const argMatch = after.match(/^\s*(['"`])([\s\S]*?)\1/);
    if (!argMatch) continue;
    const sample = unescapeStringLiteral(argMatch[2]);
    if (!isLikelyUserCopy(sample)) continue;
    const line = source.slice(0, toastMatch.index).split('\n').length;
    findings.push({
      file: relPath,
      line,
      column: toastMatch.index - source.lastIndexOf('\n', toastMatch.index),
      surface,
      module,
      category: 'TOAST',
      presentationOwner: 'toast',
      kind: 'TOAST_LITERAL',
      sample: sample.slice(0, 120),
      severity: isEnforcedCleanSurface(surface, relPath) ? 'enforce-clean' : 'debt',
      migrationPhase: migrationPhaseFor(relPath, surface),
      structuralContext: extractStructuralContext(source, toastMatch.index),
    });

    const descriptionMatch = after.match(/description\s*:\s*(['"`])([\s\S]*?)\1/);
    if (descriptionMatch) {
      const descriptionSample = unescapeStringLiteral(descriptionMatch[2]);
      if (isLikelyUserCopy(descriptionSample)) {
        findings.push({
          file: relPath,
          line,
          column: toastMatch.index - source.lastIndexOf('\n', toastMatch.index),
          surface,
          module,
          category: 'TOAST',
          presentationOwner: 'toast.description',
          kind: 'TOAST_DESCRIPTION',
          sample: descriptionSample.slice(0, 120),
          severity: isEnforcedCleanSurface(surface, relPath) ? 'enforce-clean' : 'debt',
          migrationPhase: migrationPhaseFor(relPath, surface),
          structuralContext: extractStructuralContext(source, toastMatch.index),
        });
      }
    }
  }

  const setErrorRe = /\bsetError\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
  let setErrorMatch;
  while ((setErrorMatch = setErrorRe.exec(source)) !== null) {
    const sample = unescapeStringLiteral(setErrorMatch[2]);
    if (!isLikelyUserCopy(sample)) continue;
    const line = source.slice(0, setErrorMatch.index).split('\n').length;
    findings.push({
      file: relPath,
      line,
      column: setErrorMatch.index - source.lastIndexOf('\n', setErrorMatch.index),
      surface,
      module,
      category: 'ERROR_FALLBACK',
      presentationOwner: 'setError',
      kind: 'ERROR_FALLBACK',
      sample: sample.slice(0, 120),
      severity: isEnforcedCleanSurface(surface, relPath) ? 'enforce-clean' : 'debt',
      migrationPhase: migrationPhaseFor(relPath, surface),
      structuralContext: extractStructuralContext(source, setErrorMatch.index),
    });
  }

  const throwErrorRe = /throw\s+new\s+Error\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
  // Developer throws are excluded from host-presentation debt; user-facing fallbacks
  // are captured via JSX / toast / setError patterns instead.
  void throwErrorRe;

  return findings;
}
