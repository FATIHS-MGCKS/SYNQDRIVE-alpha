import * as fs from 'fs';
import * as path from 'path';
import { SINGLETON_GLOBAL_SCHEDULER_NAMES } from '@shared/scheduler-leader/scheduler-leader.registry';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const WORKER_DIR = path.join(__dirname, '..');

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('DI V0 S4 research worker dormant-by-construction audit', () => {
  it('composed via VehicleIntelligenceModule (not AppModule direct)', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('s4-research-worker')).toBe(false);
    const vi = fs.readFileSync(
      path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts'),
      'utf8',
    );
    expect(vi.includes('DiV0S4ResearchModule')).toBe(true);
  });

  it('registers research scheduler for leader guard', () => {
    expect(SINGLETON_GLOBAL_SCHEDULER_NAMES).toContain('di_v0_s4_research_v2');
  });

  it('no S4C import and no trip FSM mutation paths', () => {
    const files = fs.readdirSync(WORKER_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    const banned = [
      /s4c-executor/i,
      /UPDATE\s+vehicle_trips\s+SET/i,
      /DimoProvider|dimo\.telemetry/i,
      /@Controller\(/,
    ];
    for (const file of files) {
      const body = stripComments(fs.readFileSync(path.join(WORKER_DIR, file), 'utf8'));
      for (const pattern of banned) {
        expect(body).not.toMatch(pattern);
      }
    }
  });

  it('does not set S4 work item FAILED in processor path', () => {
    const proc = fs.readFileSync(path.join(WORKER_DIR, 'di-v0-s4-research-processor.ts'), 'utf8');
    expect(proc.includes("status = 'FAILED'")).toBe(false);
    expect(proc.includes('di_v0_s4_work_items')).toBe(false);
  });

  it('uses fenced SQL read repository for S4 tables (no Prisma S4 delegates in production)', () => {
    const files = fs.readdirSync(WORKER_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    for (const file of files) {
      const body = stripComments(fs.readFileSync(path.join(WORKER_DIR, file), 'utf8'));
      expect(body).not.toMatch(/\.diV0S4[A-Za-z]*\s*\./);
    }
    expect(
      fs.existsSync(path.join(WORKER_DIR, 'di-v0-s4-research-s4-read.repository.ts')),
    ).toBe(true);
  });
});
