import * as fs from 'fs';
import * as path from 'path';
import { SINGLETON_GLOBAL_SCHEDULER_NAMES } from '@shared/scheduler-leader/scheduler-leader.registry';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const S4E_DIR = path.join(__dirname, '..');

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('DI V0 S4E dormant-by-construction audit', () => {
  it('S4E_APP_RUNTIME_REGISTERED=NO', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('s4e-drift-watcher')).toBe(false);
    expect(app.includes('DiV0S4e')).toBe(false);
  });

  it('registers drift watcher scheduler name for leader guard', () => {
    expect(SINGLETON_GLOBAL_SCHEDULER_NAMES).toContain('di_v0_s4_drift_watcher');
  });

  it('PROVIDER_CALL_PATH_FROM_S4E=0 and no trip FSM mutation paths', () => {
    const files = fs.readdirSync(S4E_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    const banned = [
      /DimoProvider|DimoRequest|dimo\.telemetry|@dimo\//i,
      /UPDATE\s+vehicle_trips\s+SET/i,
      /BullMQ|bullmq/i,
      /@Controller\(/,
      /trip-fsm/i,
    ];
    for (const file of files) {
      const body = stripComments(fs.readFileSync(path.join(S4E_DIR, file), 'utf8'));
      for (const pattern of banned) {
        expect(body).not.toMatch(pattern);
      }
    }
  });

  it('S4E_BULLMQ_USED=NO', () => {
    const body = fs
      .readdirSync(S4E_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => fs.readFileSync(path.join(S4E_DIR, f), 'utf8'))
      .join('\n');
    expect(body.includes('BullMQ')).toBe(false);
    expect(body.includes('bullmq')).toBe(false);
  });
});
