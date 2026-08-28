import {
  DIMO_SEGMENTS_FORBIDDEN_ARGUMENTS,
  DIMO_SEGMENT_FORBIDDEN_SELECTION_FIELDS,
  DIMO_SEGMENT_REQUIRED_SELECTION_FIELDS,
  DIMO_SEGMENT_SIGNALS_SELECTION_FIELDS,
} from '../fixtures/dimo-telemetry-segments.schema.fixture';

export interface DimoSegmentsQueryValidationResult {
  valid: boolean;
  violations: string[];
}

function extractBalancedBlock(
  source: string,
  openIndex: number,
): string | null {
  if (source[openIndex] !== '(' && source[openIndex] !== '{') return null;
  const openChar = source[openIndex];
  const closeChar = openChar === '(' ? ')' : '}';
  let depth = 0;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, i);
      }
    }
  }
  return null;
}

function extractSegmentsCallBlock(query: string): string | null {
  const segmentsIdx = query.indexOf('segments(');
  if (segmentsIdx < 0) return null;
  return extractBalancedBlock(query, segmentsIdx + 'segments'.length);
}

function extractSegmentSelectionBlock(query: string): string | null {
  const segmentsIdx = query.indexOf('segments(');
  if (segmentsIdx < 0) return null;
  const argsStart = segmentsIdx + 'segments'.length;
  const argsBlock = extractBalancedBlock(query, argsStart);
  if (!argsBlock) return null;

  const afterArgsIdx = argsStart + argsBlock.length + 2;
  const braceIdx = query.indexOf('{', afterArgsIdx);
  if (braceIdx < 0) return null;
  return extractBalancedBlock(query, braceIdx);
}

/**
 * Validates a DIMO `segments` GraphQL query against the committed live-schema
 * fixture. Catches regressions like 79e381069 (`id`, `limit`, `after`).
 */
export function validateDimoSegmentsQuery(
  query: string,
): DimoSegmentsQueryValidationResult {
  const violations: string[] = [];
  const normalized = query.replace(/\s+/g, ' ').trim();

  const callBlock = extractSegmentsCallBlock(query);
  if (!callBlock) {
    violations.push('missing segments(...) call');
  } else {
    for (const forbidden of DIMO_SEGMENTS_FORBIDDEN_ARGUMENTS) {
      const pattern = new RegExp(`\\b${forbidden}\\s*:`);
      if (pattern.test(callBlock)) {
        violations.push(`forbidden segments argument: ${forbidden}`);
      }
    }
  }

  const selectionBlock = extractSegmentSelectionBlock(query);
  if (!selectionBlock) {
    violations.push('missing Segment selection set');
  } else {
    for (const field of DIMO_SEGMENT_REQUIRED_SELECTION_FIELDS) {
      if (!new RegExp(`\\b${field}\\b`).test(selectionBlock)) {
        violations.push(`missing required Segment field: ${field}`);
      }
    }

    for (const forbidden of DIMO_SEGMENT_FORBIDDEN_SELECTION_FIELDS) {
      if (new RegExp(`\\b${forbidden}\\b`).test(selectionBlock)) {
        violations.push(`forbidden Segment selection field: ${forbidden}`);
      }
    }

    const signalsMatch = selectionBlock.match(/signals\s*\{/);
    if (signalsMatch) {
      const signalsStart =
        selectionBlock.indexOf('signals') + 'signals'.length;
      const braceIdx = selectionBlock.indexOf('{', signalsStart);
      const signalsBody =
        braceIdx >= 0 ? extractBalancedBlock(selectionBlock, braceIdx) : null;
      if (!signalsBody) {
        violations.push('missing signals selection set');
      } else {
        if (/\bagg\b/.test(signalsBody)) {
          violations.push('forbidden signals selection field: agg');
        }
        for (const field of DIMO_SEGMENT_SIGNALS_SELECTION_FIELDS) {
          if (!new RegExp(`\\b${field}\\b`).test(signalsBody)) {
            violations.push(`missing required signals field: ${field}`);
          }
        }
      }
    } else {
      violations.push('missing signals selection set');
    }
  }

  if (normalized.length === 0) {
    violations.push('empty query');
  }

  return { valid: violations.length === 0, violations };
}
