import {
  evaluatePhysicalRefuelSibling,
  HISTORICAL_REFUEL_CALIBRATION_ROWS,
} from './physical-refuel-identity.matcher';
import {
  KS_MX_2024_SEPT04_EVENT_A,
  KS_MX_2024_SEPT04_EVENT_B,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';

describe('physical refuel identity matcher (G1.1 dry-run)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];

  it('merges 2026-09-04 incident A+B as same physical refuel', () => {
    const result = evaluatePhysicalRefuelSibling(incidentA, incidentB);
    expect(result.match).toBe(true);
    expect(result.canonicalPrefer).toBe('A');
  });

  it('does not merge clearly separate refuels on different days', () => {
    const sep = HISTORICAL_REFUEL_CALIBRATION_ROWS[4];
    const other = HISTORICAL_REFUEL_CALIBRATION_ROWS[5];
    expect(evaluatePhysicalRefuelSibling(sep, other).match).toBe(false);
  });

  it('does not merge incident with unrelated row', () => {
    expect(evaluatePhysicalRefuelSibling(incidentA, HISTORICAL_REFUEL_CALIBRATION_ROWS[4]).match).toBe(
      false,
    );
  });

  it('flags Aug29 overlapping pair as sibling when same vehicle placeholder used', () => {
    const long = HISTORICAL_REFUEL_CALIBRATION_ROWS[2];
    const short = HISTORICAL_REFUEL_CALIBRATION_ROWS[3];
    // Same endTime — would match if fuel end states align; calibration documents UNCERTAIN without fuel endpoints
    const result = evaluatePhysicalRefuelSibling(long, short);
    expect(result.match).toBe(true);
    expect(result.canonicalPrefer).toBe('A');
  });

  it('fixture transitions are suffix-compatible 7→28 and 21→28', () => {
    expect(KS_MX_2024_SEPT04_EVENT_A.fuelStartLiters).toBe(7);
    expect(KS_MX_2024_SEPT04_EVENT_B.fuelStartLiters).toBe(21);
    expect(KS_MX_2024_SEPT04_EVENT_A.fuelEndLiters).toBe(28);
    expect(KS_MX_2024_SEPT04_EVENT_B.fuelEndLiters).toBe(28);
  });
});
