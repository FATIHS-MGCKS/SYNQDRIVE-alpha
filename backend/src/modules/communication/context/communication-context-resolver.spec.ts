import {
  resolveDeterministicBookingStation,
} from './communication-context-resolver.service';
import {
  communicationContextSourceStrength,
  isStrongerCommunicationContextSource,
} from './communication-context-source.util';
import { CommunicationContextResolutionSource } from './communication-context.types';
import { normalizeCommunicationPhone } from './communication-phone.util';
import { isBookingEligibleForCommunicationResolution } from './booking-eligibility.util';
import { BookingStatus } from '@prisma/client';

describe('communication context utilities', () => {
  it('normalizes communication phone with DE national handling', () => {
    expect(normalizeCommunicationPhone('+49 170 1234567')).toBe('491701234567');
    expect(normalizeCommunicationPhone('01701234567')).toBe('491701234567');
  });

  it('ranks native relation above exact phone', () => {
    expect(
      isStrongerCommunicationContextSource(
        CommunicationContextResolutionSource.NATIVE_RELATION,
        CommunicationContextResolutionSource.EXACT_PHONE,
      ),
    ).toBe(true);
    expect(
      communicationContextSourceStrength(CommunicationContextResolutionSource.EXISTING_CANONICAL),
    ).toBeGreaterThan(
      communicationContextSourceStrength(CommunicationContextResolutionSource.EXACT_PHONE),
    );
  });

  it('resolves station only when booking has one unique station candidate', () => {
    expect(
      resolveDeterministicBookingStation({
        pickupStationId: 's1',
        returnStationId: 's1',
        actualPickupStationId: null,
        actualReturnStationId: null,
      }),
    ).toBe('s1');

    expect(
      resolveDeterministicBookingStation({
        pickupStationId: 's1',
        returnStationId: 's2',
        actualPickupStationId: null,
        actualReturnStationId: null,
      }),
    ).toBeNull();
  });

  it('uses repository booking eligibility statuses', () => {
    expect(isBookingEligibleForCommunicationResolution(BookingStatus.ACTIVE)).toBe(true);
    expect(isBookingEligibleForCommunicationResolution(BookingStatus.COMPLETED)).toBe(false);
  });
});
