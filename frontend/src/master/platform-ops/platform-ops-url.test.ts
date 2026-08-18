import { describe, expect, it } from 'vitest';
import { migratePlatformHealthParams, readPlatformOpsLocation } from './platform-ops-url';

describe('platform-ops-url', () => {
  it('migrates platform-health to platform-ops overview', () => {
    const next = migratePlatformHealthParams('?view=platform-health');
    expect(next).toContain('view=platform-ops');
    expect(next).toContain('platformOps=overview');
  });

  it('migrates opsTab workers to processing tab', () => {
    const next = migratePlatformHealthParams('?view=platform-health&opsTab=workers');
    expect(next).toContain('platformOps=processing');
    expect(next).toContain('platformOpsTab=workers');
  });

  it('reads platform ops location from search', () => {
    const loc = readPlatformOpsLocation('?view=platform-ops&platformOps=incidents&incidentId=inc-1');
    expect(loc.section).toBe('incidents');
    expect(loc.incidentId).toBe('inc-1');
  });
});
