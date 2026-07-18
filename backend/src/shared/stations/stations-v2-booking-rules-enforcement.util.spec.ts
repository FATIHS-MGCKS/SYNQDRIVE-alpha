import { resolveStationsV2BookingRulesGate } from './stations-v2-booking-rules-enforcement.util';

describe('stations-v2-booking-rules-enforcement.util', () => {
  it('skips evaluation when rules disabled', () => {
    const gate = resolveStationsV2BookingRulesGate({
      enabled: false,
      enforcement: 'off',
      capacityWarningsEnabled: false,
    });
    expect(gate.evaluate).toBe(false);
  });

  it('shadow mode evaluates without persistence or blocks', () => {
    const gate = resolveStationsV2BookingRulesGate({
      enabled: true,
      enforcement: 'shadow',
      capacityWarningsEnabled: true,
    });
    expect(gate.evaluate).toBe(true);
    expect(gate.persistSnapshot).toBe(false);
    expect(gate.enforcePersistenceBlock).toBe(false);
    expect(gate.attachToResponse).toBe(true);
  });

  it('warning mode persists snapshot without hard blocks', () => {
    const gate = resolveStationsV2BookingRulesGate({
      enabled: true,
      enforcement: 'warning',
      capacityWarningsEnabled: true,
    });
    expect(gate.persistSnapshot).toBe(true);
    expect(gate.enforcePersistenceBlock).toBe(false);
  });

  it('enforce mode blocks persistence violations', () => {
    const gate = resolveStationsV2BookingRulesGate({
      enabled: true,
      enforcement: 'enforce',
      capacityWarningsEnabled: true,
    });
    expect(gate.enforcePersistenceBlock).toBe(true);
  });
});
