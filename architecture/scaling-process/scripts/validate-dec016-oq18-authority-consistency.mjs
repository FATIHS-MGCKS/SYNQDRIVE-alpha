#!/usr/bin/env node
/**
 * Guardrail: current scaling authority must not regress DEC-016 / OQ-18 production validation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const base = join(root, '..');

const currentState = readFileSync(join(base, 'CURRENT_STATE.md'), 'utf8');
const nodesYaml = readFileSync(join(base, 'graph', 'nodes.yaml'), 'utf8');
const knowledgeGraph = readFileSync(join(base, 'SCALING_PROCESS_KNOWLEDGE_GRAPH.md'), 'utf8');
const multiReplica = readFileSync(join(base, 'MULTI_REPLICA_DEPLOYMENT.md'), 'utf8');

const errors = [];

const blockMatch = currentState.match(/```\n([\s\S]*?)\n```/);
if (!blockMatch) {
  errors.push('CURRENT_STATE.md: machine-readable block missing');
} else {
  const block = blockMatch[1];
  const required = [
    ['DEPLOY_EXACT_SHA_INVARIANT = VERIFIED_PRODUCTION', /DEPLOY_EXACT_SHA_INVARIANT\s*=\s*VERIFIED_PRODUCTION/],
    ['DEC_016_FULL_INVARIANT_PRODUCTION_PROOF = YES', /DEC_016_FULL_INVARIANT_PRODUCTION_PROOF\s*=\s*YES/],
    ['DEC_016_PRODUCTION_VALIDATION = FULLY_PRODUCTION_VALIDATED', /DEC_016_PRODUCTION_VALIDATION\s*=\s*FULLY_PRODUCTION_VALIDATED/],
    ['DEC_016_FULL_INVARIANT = VERIFIED_PRODUCTION', /DEC_016_FULL_INVARIANT\s*=\s*VERIFIED_PRODUCTION/],
    ['OQ_18_STATUS = CLOSED', /OQ_18_STATUS\s*=\s*CLOSED/],
  ];
  for (const [label, re] of required) {
    if (!re.test(block)) errors.push(`CURRENT_STATE machine block missing: ${label}`);
  }
}

const narrativeParts = currentState.split('```').slice(2).join('```');
const narrativeWithoutHistorical = narrativeParts.replace(
  /\*\*HISTORICAL[\s\S]*?(?=\n## |\n\*\*|$)/g,
  '',
);

for (const stale of [
  'PARTIALLY_PRODUCTION_VALIDATED',
  'NEEDS_PRECISION_REVIEW',
  'LIKELY_PRODUCTION_VERIFIED',
]) {
  if (new RegExp(stale).test(narrativeWithoutHistorical)) {
    errors.push(`CURRENT_STATE narrative (non-historical) contains stale: ${stale}`);
  }
}

const exactShaNode = nodesYaml.match(/- id: EXACT_SHA_DEPLOY_PROVENANCE[\s\S]*?(?=\n  - id:|\n\S)/);
if (!exactShaNode) {
  errors.push('graph/nodes.yaml: EXACT_SHA_DEPLOY_PROVENANCE node missing');
} else {
  const node = exactShaNode[0];
  if (!/status: FULLY_PRODUCTION_VALIDATED/.test(node)) {
    errors.push('EXACT_SHA_DEPLOY_PROVENANCE status is not FULLY_PRODUCTION_VALIDATED');
  }
  if (!/confidence: HIGH/.test(node)) {
    errors.push('EXACT_SHA_DEPLOY_PROVENANCE confidence is not HIGH');
  }
  if (!/P1_8_3_5_INC_07_PRODUCTION_VALIDATION_BASELINE_2026-09-03\.md/.test(node)) {
    errors.push('EXACT_SHA_DEPLOY_PROVENANCE missing P1.8.3.5 validated_by reference');
  }
  if (/status: PARTIALLY_PRODUCTION_VALIDATED/.test(node)) {
    errors.push('EXACT_SHA_DEPLOY_PROVENANCE still PARTIALLY_PRODUCTION_VALIDATED');
  }
}

const kgBootstrap = knowledgeGraph.match(/BOOTSTRAP →[^\n]*/)?.[0] ?? '';
if (/LIKELY_PRODUCTION_VERIFIED|precision review/i.test(kgBootstrap)) {
  errors.push('SCALING_PROCESS_KNOWLEDGE_GRAPH BOOTSTRAP line has stale OQ-18/DEC-016 semantics');
}
if (!/OQ-18 \*\*CLOSED\*\*/.test(knowledgeGraph)) {
  errors.push('SCALING_PROCESS_KNOWLEDGE_GRAPH missing current OQ-18 CLOSED reference');
}
if (!/DEC-016 \*\*FULLY_PRODUCTION_VALIDATED\*\*/.test(knowledgeGraph)) {
  errors.push('SCALING_PROCESS_KNOWLEDGE_GRAPH missing current DEC-016 FULLY_PRODUCTION_VALIDATED reference');
}

const mrSection = multiReplica.match(/## Deploy provenance \(DEC-016\)[\s\S]*?(?=\n## )/)?.[0] ?? multiReplica;
if (/NEEDS_PRECISION_REVIEW|LIKELY_PRODUCTION_VERIFIED/.test(mrSection.replace(/HISTORICAL[\s\S]*/i, ''))) {
  errors.push('MULTI_REPLICA_DEPLOYMENT.md current DEC-016 section has stale semantics');
}

if (errors.length > 0) {
  console.error('DEC-016 / OQ-18 authority consistency validation FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('OK: DEC-016 / OQ-18 current authority consistent across scaling-process files');
