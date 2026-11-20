import * as fs from 'node:fs';
import * as path from 'node:path';

describe('AiModule rental health composition imports', () => {
  const modulePath = path.join(__dirname, 'ai.module.ts');

  it('imports VehicleIntelligenceRentalHealthReadModule and not RentalHealthModule', () => {
    const src = fs.readFileSync(modulePath, 'utf8');
    expect(src).toContain('VehicleIntelligenceRentalHealthReadModule');
    expect(src).not.toMatch(/RentalHealthModule/);
  });
});