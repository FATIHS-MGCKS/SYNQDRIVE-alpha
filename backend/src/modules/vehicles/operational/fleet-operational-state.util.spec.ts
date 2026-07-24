import { fleetDisplayStatusToToken, buildFleetOperationalStateDto } from './fleet-operational-state.util';

describe('fleet-operational-state.util', () => {
  it('maps Blocked display status to BLOCKED token', () => {
    expect(fleetDisplayStatusToToken('Blocked')).toBe('BLOCKED');
  });

  it('maps unknown display status to UNKNOWN — never AVAILABLE', () => {
    expect(fleetDisplayStatusToToken('???')).toBe('UNKNOWN');
    expect(fleetDisplayStatusToToken('???')).not.toBe('AVAILABLE');
  });

  it('builds operational state dto for Blocked vehicles', () => {
    const dto = buildFleetOperationalStateDto({ displayStatus: 'Blocked' });
    expect(dto.status).toBe('BLOCKED');
    expect(dto.isReliable).toBe(true);
  });

  it('builds operational state dto for Unknown vehicles', () => {
    const dto = buildFleetOperationalStateDto({ displayStatus: 'Unknown' });
    expect(dto.status).toBe('UNKNOWN');
  });
});
