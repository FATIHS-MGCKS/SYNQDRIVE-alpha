import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Physical device inventory P1B.2 cross-workstream firewall', () => {
  it('lifecycle writes do not mutate VDC, DIMO, VO registry, or billing', () => {
    const writesSource = readFileSync(
      join(__dirname, 'physical-device-inventory-p1b2.writes.ts'),
      'utf8',
    );
    expect(writesSource).not.toMatch(/vehicleDataSourceLink\.(update|create|delete|upsert)/i);
    expect(writesSource).not.toMatch(/vehicleRegistryLifecycleOutbox/i);
    expect(writesSource).not.toMatch(/billingSubscription/i);
    expect(writesSource).toContain('providerBindingMutated: false');
    expect(writesSource).toContain('vehicleDataSourceLinksMutated: false');
  });
});
