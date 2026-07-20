export const FHS_PIPELINE_FIXED_NOW = new Date('2026-07-20T12:00:00.000Z');

export interface FleetHealthServicePipelineFixtureIds {
  orgA: string;
  orgB: string;
  vehicleA: string;
  vehicleB: string;
  vehicleOtherOrg: string;
  vendorA: string;
  operatorA: string;
  operatorB: string;
}

export function createFleetHealthServicePipelineFixtures(): FleetHealthServicePipelineFixtureIds {
  return {
    orgA: 'org-fhs-a',
    orgB: 'org-fhs-b',
    vehicleA: 'veh-fhs-a',
    vehicleB: 'veh-fhs-b',
    vehicleOtherOrg: 'veh-fhs-other',
    vendorA: 'vendor-fhs-a',
    operatorA: 'operator-fhs-a',
    operatorB: 'operator-fhs-b',
  };
}
