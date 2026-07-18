import {
  DRIVER_CANDIDATE_CONFLICT_CODES,
  DRIVER_CANDIDATE_MATCH_REASONS,
} from './driver-candidate-resolver.types';
import {
  buildDriverResolverHints,
  buildDriverResolverPrivateHints,
  isDriverUnassignedForFine,
  scoreDriverCandidates,
} from './driver-candidate-matching.util';

describe('driver-candidate-matching.util', () => {
  const primaryDriver = {
    id: '11111111-1111-4111-8111-111111111111',
    firstName: 'Anna',
    lastName: 'Fahrer',
    company: null,
    fullNameNormalized: 'anna fahrer',
    licenseNumberNormalized: 'B1234567',
  };
  const additionalDriver = {
    id: '22222222-2222-4222-8222-222222222222',
    firstName: 'Ben',
    lastName: 'Zusatz',
    company: null,
    fullNameNormalized: 'ben zusatz',
    licenseNumberNormalized: 'B7654321',
  };
  const companyCustomer = {
    id: '33333333-3333-4333-8333-333333333333',
    firstName: 'Fleet',
    lastName: 'GmbH',
    company: 'Fleet GmbH',
    fullNameNormalized: 'fleet gmbh',
    licenseNumberNormalized: null,
  };

  const bookingPool = {
    bookingId: 'book-1',
    bookingCustomerId: companyCustomer.id,
    primaryDriverId: primaryDriver.id,
    additionalDriverIds: [additionalDriver.id],
    allowedDriverIds: [primaryDriver.id, additionalDriver.id],
    tripDriverId: null,
  };

  it('resolves primary driver via license match', () => {
    const privateHints = buildDriverResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { licenseNumber: 'B 1234567' },
      linkedBookingId: 'book-1',
    });
    const candidates = scoreDriverCandidates({
      drivers: [primaryDriver, additionalDriver, companyCustomer],
      privateHints,
      bookingPool,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].driverCustomerId).toBe(primaryDriver.id);
    expect(candidates[0].driverRole).toBe('PRIMARY');
    expect(candidates[0].matchReasons).toContain(DRIVER_CANDIDATE_MATCH_REASONS.LICENSE_EXACT);
    expect(candidates[0].confirmationRequired).toBe(true);
  });

  it('resolves additional driver when name matches', () => {
    const privateHints = buildDriverResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { driverName: 'Ben Zusatz' },
      linkedBookingId: 'book-1',
    });
    const candidates = scoreDriverCandidates({
      drivers: [primaryDriver, additionalDriver],
      privateHints,
      bookingPool,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].driverCustomerId).toBe(additionalDriver.id);
    expect(candidates[0].driverRole).toBe('ADDITIONAL');
    expect(candidates[0].matchReasons).toContain(DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT);
  });

  it('does not treat booking company customer as driver', () => {
    const privateHints = buildDriverResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { customerName: 'Fleet GmbH', driverName: 'Fleet GmbH' },
      linkedBookingId: 'book-1',
    });
    const candidates = scoreDriverCandidates({
      drivers: [primaryDriver, additionalDriver, companyCustomer],
      privateHints,
      bookingPool,
    });
    expect(candidates.every((candidate) => candidate.driverCustomerId !== companyCustomer.id)).toBe(
      true,
    );
  });

  it('marks unclear driver pool as ambiguous without strong unique signal', () => {
    const privateHints = buildDriverResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: {},
      linkedBookingId: 'book-1',
    });
    const candidates = scoreDriverCandidates({
      drivers: [primaryDriver, additionalDriver],
      privateHints,
      bookingPool,
    });
    expect(candidates.length).toBeGreaterThan(1);
    expect(
      candidates.every((candidate) =>
        candidate.conflicts.some(
          (conflict) => conflict.code === DRIVER_CANDIDATE_CONFLICT_CODES.AMBIGUOUS_DRIVER_POOL,
        ),
      ),
    ).toBe(true);
    expect(
      isDriverUnassignedForFine({
        documentType: 'FINE',
        candidates,
        ambiguousDriverPool: true,
      }),
    ).toBe(true);
  });

  it('does not expose raw PII in public hints', () => {
    const privateHints = buildDriverResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: {
        driverName: 'Anna Fahrer',
        licenseNumber: 'B1234567',
        driverId: primaryDriver.id,
      },
      uploadContextDriverId: primaryDriver.id,
    });
    const hints = buildDriverResolverHints(privateHints, 'book-1', primaryDriver.id);
    expect(hints.driverNamePresent).toBe(true);
    expect(hints.licensePresent).toBe(true);
    expect(hints.driverIdPresent).toBe(true);
    expect(JSON.stringify(hints)).not.toContain('Anna Fahrer');
    expect(JSON.stringify(hints)).not.toContain('B1234567');
  });
});
