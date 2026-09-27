import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const FOUNDATION_DIR = path.join(__dirname, '..');

function walk(dir: string, pattern: RegExp, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) continue;
      walk(full, pattern, acc);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const productionFiles = fs
  .readdirSync(FOUNDATION_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => path.join(FOUNDATION_DIR, name));

const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:import|export)\s[^'"]*?from\s+'([^']+)'|require\('([^']+)'\)|import\('([^']+)'\)/g)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );

const ALLOWED_IMPORTS = new Set([
  'crypto',
  'zlib',
  '@prisma/client',
  '@shared/database/prisma.service',
  '../../trips/boundary-repair.state.util',
  '../core/versions',
  '../shadow-persistence/di-v0-shadow-completion',
  '../shadow-persistence/di-v0-shadow-idempotency',
  '../shadow-persistence/di-v0-shadow-persistence.repository',
  '../shadow-persistence/di-v0-shadow-types',
  '../shadow-persistence/di-v0-shadow-validation',
]);

const ALLOWED_MUTATION_TABLES = new Set([
  'di_v0_s4_work_items',
  'di_v0_s4_evidence_snapshots',
  'di_v0_s4_pipeline_versions',
  'di_v0_shadow_runs',
]);

describe('DI V0 S4A dormant-by-construction audit', () => {
  it('has production files to audit', () => {
    expect(productionFiles.map((f) => path.basename(f)).sort()).toEqual([
      'di-v0-s4a-contract.ts',
      'di-v0-s4a-control-plane.ts',
      'di-v0-s4a-errors.ts',
      'di-v0-s4a-identity.ts',
      'di-v0-s4a-s2-fenced-persistence.ts',
      'di-v0-s4a-state-machine.ts',
      'di-v0-s4a-work-item.repository.ts',
    ]);
  });

  it('DI_S4A_RUNTIME_CALL_SITE_COUNT=0: nothing outside s4a-foundation imports it', () => {
    const roots = ['backend/src', 'backend/scripts', 'backend/prisma', 'backend/test', 'frontend/src'].map((r) =>
      path.join(REPO_ROOT, r),
    );
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root, /\.(ts|tsx|js|mjs|cjs)$/)) {
        if (file.startsWith(FOUNDATION_DIR + path.sep)) continue;
        const source = fs.readFileSync(file, 'utf8');
        const importsFoundation = importsOf(source).some((spec) => /s4a-foundation|di-v0-s4a-/.test(spec));
        const namesFoundation = /\b(DiV0S4WorkItemRepository|persistDiV0S4FencedS2Run)\b/.test(stripComments(source));
        if (importsFoundation || namesFoundation) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  it('imports only pure helpers, Prisma types and the existing S2 persistence helpers', () => {
    const offending: string[] = [];
    const seen = new Set<string>();
    for (const file of productionFiles) {
      for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
        seen.add(spec);
        if (!spec.startsWith('./di-v0-s4a-') && !ALLOWED_IMPORTS.has(spec)) offending.push(`${path.basename(file)} -> ${spec}`);
      }
    }
    expect(offending).toEqual([]);
    expect([...ALLOWED_IMPORTS].filter((spec) => !seen.has(spec))).toEqual([]);
  });

  it('registers no Nest provider/module, scheduler, queue, worker, HTTP route or env read', () => {
    const forbidden: Array<[string, RegExp]> = [
      ['Nest decorator', /@(Injectable|Module|Controller|Processor|Process|Cron|Interval|Timeout|OnEvent|Get|Post|Put|Patch|Delete)\s*\(/],
      ['Nest import', /from\s+'@nestjs\//],
      ['BullMQ', /from\s+'bullmq'|BullModule|InjectQueue|new\s+(Queue|Worker|QueueEvents)\s*\(/],
      ['scheduler', /node-cron|@nestjs\/schedule|setInterval\s*\(|setTimeout\s*\(/],
      ['HTTP client / provider', /from\s+'(axios|node-fetch|undici|graphql-request)'|\bfetch\s*\(|from\s+'[^']*dimo[^']*'/i],
      ['env read', /process\.env/],
      ['event emitter', /EventEmitter|\.emit\s*\(/],
    ];
    const offending: string[] = [];
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const [label, re] of forbidden) {
        if (re.test(code)) offending.push(`${path.basename(file)}: ${label}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it('mutates only S4 work/evidence/registry tables and S2 runs; never the control row or canonical tables', () => {
    const offending: string[] = [];
    const targets = new Set<string>();
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const m of code.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE)\s+([a-z_][a-z0-9_]*)\b/g)) {
        const verb = m[1].replace(/\s+/g, ' ');
        const table = m[2];
        targets.add(table);
        if (!['INSERT INTO', 'UPDATE'].includes(verb) || !ALLOWED_MUTATION_TABLES.has(table)) {
          offending.push(`${path.basename(file)}: ${verb} ${table}`);
        }
      }
    }
    expect(offending).toEqual([]);
    expect([...targets].sort()).toEqual([...ALLOWED_MUTATION_TABLES].sort());
    expect(targets.has('di_v0_s4_control')).toBe(false);
  });

  it('never uses Prisma model delegates for S4 tables (all S4 SQL is explicit and fenced)', () => {
    const hits: string[] = [];
    for (const file of walk(path.join(REPO_ROOT, 'backend/src'), /\.ts$/)) {
      if (/\.diV0S4[A-Za-z]*\s*\./.test(fs.readFileSync(file, 'utf8'))) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  it('exposes no generic status setter', () => {
    const offending: string[] = [];
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/\b(setStatus|updateStatus|forceStatus|transitionTo)\b/.test(code)) offending.push(path.basename(file));
      if (/SET\s+status\s*=\s*\$\{/.test(code)) offending.push(`${path.basename(file)}: parameterised status`);
    }
    expect(offending).toEqual([]);
  });
});
