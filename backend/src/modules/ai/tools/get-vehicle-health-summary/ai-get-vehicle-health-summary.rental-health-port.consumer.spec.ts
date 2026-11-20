import * as fs from 'node:fs';
import * as path from 'node:path';

describe('AiGetVehicleHealthSummaryTool rental health port consumer', () => {
  const toolPath = path.join(__dirname, 'ai-get-vehicle-health-summary.tool.ts');

  it('uses VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT and does not import RentalHealthService', () => {
    const src = fs.readFileSync(toolPath, 'utf8');
    expect(src).toMatch(/VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT/);
    expect(src).not.toMatch(/from ['"].*rental-health\.service/);
    expect(src).not.toMatch(/RentalHealthService/);
  });
});