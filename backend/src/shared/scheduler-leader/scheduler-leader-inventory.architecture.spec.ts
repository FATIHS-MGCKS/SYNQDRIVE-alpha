import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  REPLICA_LOCAL_SCHEDULER_NAMES,
  SAFE_DISTRIBUTED_SCHEDULER_NAMES,
  SINGLETON_GLOBAL_SCHEDULER_NAMES,
} from './scheduler-leader.registry';

const BACKEND_SRC = join(__dirname, '../..');

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules') continue;
      walkTsFiles(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function isSchedulerProducerFile(path: string, content: string): boolean {
  if (path.includes('document-extraction-recovery.scheduler.ts')) {
    return content.includes('recoverStaleExtractions');
  }
  if (!content.includes('@Cron') && !content.includes('@Interval')) return false;
  if (path.includes('metrics-refresh')) return false;
  return true;
}

describe('P1.7 scheduler inventory architecture gate', () => {
  it('U — every SINGLETON_GLOBAL scheduler file is guarded', () => {
    const files = walkTsFiles(BACKEND_SRC);
    const unguarded: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (!isSchedulerProducerFile(file, content)) continue;

      const relative = file.replace(`${BACKEND_SRC}/`, '');
      if (
        relative.includes('dimo-dtc.scheduler.ts') ||
        relative.includes('dimo-vehicle-sync.scheduler.ts') ||
        relative.includes('scheduler-leader.registry.ts')
      ) {
        continue;
      }

      const guarded =
        content.includes('leaderGuard.shouldRun(') ||
        content.includes('leaderGuard.runIfLeader(');
      if (!guarded) {
        unguarded.push(relative);
      }
    }

    expect(unguarded).toEqual([]);
  });

  it('registry lists are bounded and disjoint', () => {
    const singleton = new Set(SINGLETON_GLOBAL_SCHEDULER_NAMES);
    const safe = new Set(SAFE_DISTRIBUTED_SCHEDULER_NAMES);
    const local = new Set(REPLICA_LOCAL_SCHEDULER_NAMES);

    expect(singleton.size).toBeGreaterThan(30);
    for (const name of safe) {
      expect(singleton.has(name as never)).toBe(false);
      expect(local.has(name as never)).toBe(false);
    }
    for (const name of local) {
      expect(singleton.has(name as never)).toBe(false);
    }
  });
});
