#!/usr/bin/env node
/**
 * Guardrail: current scaling authority must not contain contradictory INC-07 / OQ-30 states.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const base = join(root, '..');

const currentState = readFileSync(join(base, 'CURRENT_STATE.md'), 'utf8');
const nodesYaml = readFileSync(join(base, 'graph', 'nodes.yaml'), 'utf8');
const knowledgeGraph = readFileSync(join(base, 'SCALING_PROCESS_KNOWLEDGE_GRAPH.md'), 'utf8');

const errors = [];

const blockMatch = currentState.match(/```\n([\s\S]*?)\n```/);
if (!blockMatch) {
  errors.push('CURRENT_STATE.md: machine-readable block missing');
} else {
  const block = blockMatch[1];
  const required = [
    ['INC_07 = CLOSED', /INC_07\s*=\s*CLOSED/],
    ['INC_07_PRODUCTION_VALIDATED = YES', /INC_07_PRODUCTION_VALIDATED\s*=\s*YES/],
    ['OQ_30 = CLOSED', /OQ_30\s*=\s*CLOSED/],
    ['OQ_28 = PARTIAL', /OQ_28\s*=\s*PARTIAL/],
    ['N2_ALL_TIME_LONGEST_CONTINUOUS_SEGMENT_SECONDS = 76832', /N2_ALL_TIME_LONGEST_CONTINUOUS_SEGMENT_SECONDS\s*=\s*76832/],
    ['OQ28_CANDIDATE_WINDOW_LONGEST_SEGMENT_SECONDS = 48758', /OQ28_CANDIDATE_WINDOW_LONGEST_SEGMENT_SECONDS\s*=\s*48758/],
  ];
  for (const [label, re] of required) {
    if (!re.test(block)) errors.push(`CURRENT_STATE machine block missing: ${label}`);
  }
  if (/N2_LONGEST_CONTINUOUS_SEGMENT_SECONDS/.test(block)) {
    errors.push('CURRENT_STATE machine block still has ambiguous N2_LONGEST_CONTINUOUS_SEGMENT_SECONDS');
  }
  if (/LONGEST_FULL_N2_SEGMENT_SECONDS/.test(block)) {
    errors.push('CURRENT_STATE machine block still has ambiguous LONGEST_FULL_N2_SEGMENT_SECONDS');
  }
}

const narrative = currentState.split('```')[2] ?? '';
if (/FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS/.test(narrative) && !/HISTORICAL \(superseded by P1\.8\.3\.8\)/.test(narrative)) {
  errors.push('CURRENT_STATE narrative contains stale FIX_DEPLOYED without HISTORICAL marker');
}
if (/\*\*Not closed\.\*\*/i.test(narrative)) {
  errors.push('CURRENT_STATE narrative still says Not closed');
}

if (!/id: INC_07[\s\S]*?status: CLOSED/m.test(nodesYaml)) {
  errors.push('graph/nodes.yaml INC_07 status is not CLOSED');
}
if (/FIX_IMPLEMENTED_PENDING_PRODUCTION_VALIDATION/.test(nodesYaml)) {
  errors.push('graph/nodes.yaml still has FIX_IMPLEMENTED_PENDING_PRODUCTION_VALIDATION');
}

const kgCurrentStale =
  /Trip reconciliation duplicate rows → INC-07[\s\S]*FIX_DEPLOYED_PRODUCTION_VALIDATION_IN_PROGRESS(?![\s\S]*superseded)/m.test(
    knowledgeGraph,
  );
if (kgCurrentStale) {
  errors.push('SCALING_PROCESS_KNOWLEDGE_GRAPH has current-looking FIX_DEPLOYED INC-07 line without superseded marker');
}
if (!/INC-07 trip reconciliation idempotency → \*\*CLOSED\*\*/.test(knowledgeGraph)) {
  errors.push('SCALING_PROCESS_KNOWLEDGE_GRAPH missing current INC-07 CLOSED line');
}

if (errors.length > 0) {
  console.error('INC-07 authority consistency validation FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('OK: INC-07 / OQ-30 current authority consistent across scaling-process files');
