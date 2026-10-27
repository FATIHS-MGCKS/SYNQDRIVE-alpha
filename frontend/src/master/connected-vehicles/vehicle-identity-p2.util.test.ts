import { describe, expect, it } from 'vitest';
import { isVehicleIdentityP2Enabled, provenanceLabelKey } from './vehicle-identity-p2.util';

describe('vehicle-identity-p2.util', () => {
  it('is disabled unless VITE flag is true', () => {
    expect(isVehicleIdentityP2Enabled()).toBe(
      import.meta.env.VITE_ZB1_VEHICLE_IDENTITY_P2_ENABLED === 'true',
    );
  });

  it('maps provenance to label keys', () => {
    expect(provenanceLabelKey('DIMO_PROVIDER')).toBe('master.vehicleIdentity.provenance.dimo');
    expect(provenanceLabelKey('AI_ESTIMATED')).toBe('master.vehicleIdentity.provenance.aiEstimated');
    expect(provenanceLabelKey('CONFLICT')).toBe('master.vehicleIdentity.provenance.conflict');
  });
});
