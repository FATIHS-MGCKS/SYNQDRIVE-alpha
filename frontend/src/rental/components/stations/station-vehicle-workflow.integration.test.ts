import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stationsDir = resolve(import.meta.dirname);

describe('station vehicle workflow integration wiring', () => {
  it('exposes paginated lookup and preview API methods', () => {
    const apiSource = readFileSync(resolve(stationsDir, '../../../lib/api.ts'), 'utf8');
    expect(apiSource).toContain('lookupVehicleWorkflowVehicles');
    expect(apiSource).toContain('previewVehicleWorkflow');
    expect(apiSource).toContain('planVehicleStationTransfer');
    expect(apiSource).toContain('/stations/vehicle-workflows/vehicles');
    expect(apiSource).toContain('/stations/vehicle-workflows/preview');
  });

  it('routes each workflow to a dedicated backend command', () => {
    const modalSource = readFileSync(resolve(stationsDir, 'StationVehicleWorkflowModal.tsx'), 'utf8');
    expect(modalSource).toContain('changeHomeStation');
    expect(modalSource).toContain('correctVehicleCurrentStation');
    expect(modalSource).toContain('planVehicleStationTransfer');
    expect(modalSource).not.toContain('applyStationHomeFleetSelection');
    expect(modalSource).not.toContain('api.stations.setVehicles');
  });
});
