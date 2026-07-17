import {
  VEHICLE_CANDIDATE_CONFLICT_CODES,
  VEHICLE_CANDIDATE_MATCH_REASONS,
} from './vehicle-candidate-resolver.types';
import {
  buildVehicleResolverHints,
  detectVinPlateSignalBlocker,
  normalizeVehiclePlate,
  normalizeVehicleVin,
  scoreVehicleCandidates,
} from './vehicle-candidate-matching.util';

describe('vehicle-candidate-matching.util', () => {
  const vehicles = [
    {
      id: 'veh-1',
      licensePlate: 'B-AB 123',
      vin: 'WVWZZZ1JZ3W386752',
      make: 'VW',
      model: 'Golf',
      vehicleName: 'Fleet-01',
    },
    {
      id: 'veh-2',
      licensePlate: 'M-XY 999',
      vin: 'WAUZZZ8V5KA123456',
      make: 'Audi',
      model: 'A4',
      vehicleName: 'Fleet-02',
    },
    {
      id: 'veh-3',
      licensePlate: 'B-AB 456',
      vin: 'WVWZZZ1JZ3W999999',
      make: 'VW',
      model: 'Golf',
      vehicleName: 'Fleet-03',
    },
  ];

  it('normalizes plates and VINs for comparison', () => {
    expect(normalizeVehiclePlate('B-AB 123')).toBe('BAB123');
    expect(normalizeVehicleVin('wvwzzz 1jz-3w386752')).toBe('WVWZZZ1JZ3W386752');
  });

  it('returns zero candidates when no signals are present', () => {
    const hints = buildVehicleResolverHints({
      organizationId: 'org-1',
      extractedData: {},
    });
    const candidates = scoreVehicleCandidates({ vehicles, hints });
    expect(candidates).toHaveLength(0);
  });

  it('returns one high-confidence candidate for exact VIN match', () => {
    const hints = buildVehicleResolverHints({
      organizationId: 'org-1',
      extractedData: { vin: 'WVWZZZ1JZ3W386752' },
    });
    const candidates = scoreVehicleCandidates({ vehicles, hints });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].vehicleId).toBe('veh-1');
    expect(candidates[0].matchReasons[0]).toBe(VEHICLE_CANDIDATE_MATCH_REASONS.VIN_EXACT);
    expect(candidates[0].confidence).toBeGreaterThan(0.9);
    expect(candidates[0].confirmationRequired).toBe(false);
    expect(candidates[0].rank).toBe(1);
  });

  it('ranks VIN match above license plate match', () => {
    const hints = buildVehicleResolverHints({
      organizationId: 'org-1',
      extractedData: {
        vin: 'WVWZZZ1JZ3W386752',
        licensePlate: 'M-XY 999',
      },
    });
    const candidates = scoreVehicleCandidates({ vehicles, hints });
    expect(candidates[0].vehicleId).toBe('veh-1');
    expect(candidates.some((c) => c.vehicleId === 'veh-2')).toBe(true);
    expect(candidates[0].matchReasons).toContain(VEHICLE_CANDIDATE_MATCH_REASONS.VIN_EXACT);
  });

  it('returns multiple plausible candidates and requires confirmation', () => {
    const hints = buildVehicleResolverHints({
      organizationId: 'org-1',
      extractedData: { licensePlate: 'B-AB' },
    });
    const candidates = scoreVehicleCandidates({ vehicles, hints });
    const plausible = candidates.filter((c) => c.confidence >= 0.55);
    expect(plausible.length).toBeGreaterThan(1);
    expect(plausible.every((c) => c.confirmationRequired)).toBe(true);
  });

  it('detects BLOCKER when OCR VIN and plate point to different vehicles', () => {
    const hints = buildVehicleResolverHints({
      organizationId: 'org-1',
      extractedData: {
        vin: 'WVWZZZ1JZ3W386752',
        licensePlate: 'M-XY 999',
      },
    });
    const blocker = detectVinPlateSignalBlocker({ hints, vehicles });
    expect(blocker.blockerPresent).toBe(true);
    expect(blocker.conflicts[0].code).toBe(VEHICLE_CANDIDATE_CONFLICT_CODES.VIN_PLATE_MISMATCH);
    expect(blocker.conflicts[0].severity).toBe('BLOCKER');
  });

  it('applies OCR uncertainty to license plate confidence', () => {
    const hints = buildVehicleResolverHints({
      organizationId: 'org-1',
      extractedData: { licensePlate: 'B-AB 123' },
      fieldEvidence: [{ key: 'licensePlate', conflict: true }],
    });
    const candidates = scoreVehicleCandidates({ vehicles, hints });
    expect(candidates[0].matchReasons).toContain(
      VEHICLE_CANDIDATE_MATCH_REASONS.LICENSE_PLATE_FUZZY,
    );
    expect(candidates[0].confirmationRequired).toBe(true);
  });
});
