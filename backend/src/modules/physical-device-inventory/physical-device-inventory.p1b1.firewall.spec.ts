import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Physical device inventory P1B.1 cross-workstream firewall', () => {
  it('does not mutate VehicleDataSourceLink or DIMO APIs from inventory install writes', () => {
    const writesSource = readFileSync(
      join(__dirname, 'physical-device-inventory-p1b1.writes.ts'),
      'utf8',
    );
    expect(writesSource).not.toMatch(/prisma\.vehicleDataSourceLink/i);
    expect(writesSource).not.toMatch(/vehicleDataSourceLink\.(update|create|delete|upsert)/i);
    expect(writesSource).not.toMatch(/DimoService/i);
    expect(writesSource).toContain('providerBindingMutated: false');
    expect(writesSource).toContain('vehicleDataSourceLinksMutated: false');
  });

  it('VDC physical-state modules do not reference physical device inventory', () => {
    const vdcDir = join(__dirname, '../dimo/device-connection-physical-state');
    const fs = require('node:fs') as typeof import('node:fs');
    const files = fs.readdirSync(vdcDir).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const content = fs.readFileSync(join(vdcDir, file), 'utf8');
      expect(content).not.toMatch(/physicalDeviceInventory|physical_devices/i);
    }
  });
});
