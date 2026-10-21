import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const S4F_DIR = path.join(__dirname, '..');

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('DI V0 S4F dormant-by-construction audit', () => {
  it('S4F composed via DiV0S4RuntimeModule (not direct AppModule import)', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('s4f-observability')).toBe(false);
    expect(app.includes('DiV0S4f')).toBe(false);
    const vi = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts'), 'utf8');
    expect(vi.includes('DiV0S4RuntimeModule')).toBe(true);
  });

  it('no Prisma INSERT/UPDATE/DELETE against S4/S2/canonical tables in production sources', () => {
    const files = fs
      .readdirSync(S4F_DIR)
      .filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    const banned = [
      /\$executeRaw/,
      /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(di_v0_s4_|di_v0_shadow_|vehicle_trips|vehicles|organizations)\b/i,
      /DimoProvider|DimoRequest|queryGraphQL|runWithDimoRequestContext/i,
      /BullMQ|bullmq/i,
      /@Controller\(/,
      /retirePipelineVersion|supersedeOnDrift|createWorkItem|claimWorkItem|completeWithS2/,
    ];
    for (const file of files) {
      const body = stripComments(fs.readFileSync(path.join(S4F_DIR, file), 'utf8'));
      const isStaticAuditDoc = file.includes('provider-backpressure-audit');
      for (const pattern of banned) {
        if (isStaticAuditDoc && /DimoProvider|DimoRequest|queryGraphQL|runWithDimoRequestContext/i.test(pattern.source)) {
          continue;
        }
        expect(body).not.toMatch(pattern);
      }
    }
  });

  it('S4F_BULLMQ_USED=NO', () => {
    const body = fs
      .readdirSync(S4F_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => fs.readFileSync(path.join(S4F_DIR, f), 'utf8'))
      .join('\n');
    expect(body.includes('BullMQ')).toBe(false);
    expect(body.includes('bullmq')).toBe(false);
  });

  it('DiV0S4fObservabilityModule is wired through DiV0S4RuntimeModule only', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('DiV0S4fObservabilityModule')).toBe(false);
    const runtime = fs.readFileSync(
      path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime.module.ts'),
      'utf8',
    );
    expect(runtime.includes('DiV0S4fObservabilityModule')).toBe(true);
  });
});
