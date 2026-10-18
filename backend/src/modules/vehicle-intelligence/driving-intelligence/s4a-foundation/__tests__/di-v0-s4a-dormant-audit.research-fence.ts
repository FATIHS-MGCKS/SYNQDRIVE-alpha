import * as path from 'path';
import { importsOf, stripComments } from './di-v0-s4a-dormant-audit.p2-fence';

export const S4_RESEARCH_WORKER_DIR = path.join(__dirname, '../../s4-research-worker');

/** Read-only S4A edges permitted for the dormant S4 research worker (no work-item repo / state machine). */
export const S4_RESEARCH_ALLOWED_PRODUCTION_S4A_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'di-v0-s4-research-v2.service.ts': ['../s4a-foundation/di-v0-s4a-control-plane'],
  'di-v0-s4-research-control-plane.ts': ['../s4a-foundation/di-v0-s4a-control-plane'],
  'di-v0-s4-research-processor.ts': ['../s4a-foundation/di-v0-s4a-contract'],
  'di-v0-s4-research-snapshot-adapter.ts': ['../s4a-foundation/di-v0-s4a-evidence-container-parse'],
  'di-v0-s4-research-s4-read.repository.ts': ['../s4a-foundation/di-v0-s4a-contract'],
};

export const S4_RESEARCH_ALLOWED_TEST_S4A_IMPORTS = new Set([
  '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness',
  '../../s4a-foundation/di-v0-s4a-control-plane',
]);

const S4_RESEARCH_ALLOWED_TEST_FILES = new Set(['di-v0-s4-research-postgres-harness.ts']);

const FORBIDDEN_S4_RESEARCH_S4A_FRAGMENTS = [
  'di-v0-s4a-work-item.repository',
  'di-v0-s4a-s2-fenced-persistence',
  'di-v0-s4a-state-machine',
];

export function isS4ResearchWorkerFile(file: string): boolean {
  return file.startsWith(S4_RESEARCH_WORKER_DIR + path.sep);
}

export function collectS4ResearchS4aFenceViolations(file: string, source: string): string[] {
  if (!isS4ResearchWorkerFile(file)) return [];
  const rel = path.relative(S4_RESEARCH_WORKER_DIR, file).split(path.sep).join('/');
  const base = path.basename(file);
  const inTests = rel.startsWith('__tests__/') || S4_RESEARCH_ALLOWED_TEST_FILES.has(base);
  if (!base.endsWith('.ts') || inTests) {
    if (inTests) {
      const violations: string[] = [];
      for (const spec of importsOf(source)) {
        if (!/s4a-foundation|di-v0-s4a-/.test(spec)) continue;
        if (!S4_RESEARCH_ALLOWED_TEST_S4A_IMPORTS.has(spec)) {
          violations.push(`${rel}: test S4A import not allowlisted: ${spec}`);
        }
      }
      return violations;
    }
    return [];
  }

  const violations: string[] = [];
  const code = stripComments(source);
  if (/\b(DiV0S4WorkItemRepository|persistDiV0S4FencedS2Run)\b/.test(code)) {
    violations.push(`${rel}: forbidden S4A mutation symbol`);
  }
  if (/\.diV0S4[A-Za-z]*\s*\./.test(code)) {
    violations.push(`${rel}: Prisma S4 model delegate forbidden — use DiV0S4ResearchS4ReadRepository`);
  }

  for (const spec of importsOf(source)) {
    if (!/s4a-foundation|di-v0-s4a-/.test(spec)) continue;
    if (FORBIDDEN_S4_RESEARCH_S4A_FRAGMENTS.some((frag) => spec.includes(frag))) {
      violations.push(`${rel}: forbidden S4A import: ${spec}`);
      continue;
    }
    const allowed = S4_RESEARCH_ALLOWED_PRODUCTION_S4A_IMPORTS[base];
    if (!allowed?.includes(spec)) {
      violations.push(`${rel}: S4A import not allowlisted: ${spec}`);
    }
  }

  return violations;
}
