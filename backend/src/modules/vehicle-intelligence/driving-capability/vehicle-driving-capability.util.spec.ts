import { DrivingCapabilityStatus } from '@prisma/client';
import {
  hasProviderError,
  normalizeCapabilityStatusForWrite,
  resolveCapabilityKey,
} from './vehicle-driving-capability.util';

describe('vehicle-driving-capability.util', () => {
  describe('resolveCapabilityKey', () => {
    it('uses signalName when provided', () => {
      expect(resolveCapabilityKey('behavior.harshBraking', null)).toBe(
        'behavior.harshBraking',
      );
    });

    it('uses detectorName when signal is absent', () => {
      expect(resolveCapabilityKey(null, 'cold-engine-abuse')).toBe('cold-engine-abuse');
    });

    it('rejects both signal and detector', () => {
      expect(() =>
        resolveCapabilityKey('speed', 'cold-engine-abuse'),
      ).toThrow(/either signalName or detectorName/i);
    });
  });

  describe('normalizeCapabilityStatusForWrite', () => {
    it('maps provider errors away from UNSUPPORTED to DEGRADED', () => {
      expect(
        normalizeCapabilityStatusForWrite(DrivingCapabilityStatus.UNSUPPORTED, {
          providerError: true,
          providerErrorCode: 'DIMO_TIMEOUT',
        }),
      ).toBe(DrivingCapabilityStatus.DEGRADED);
    });

    it('keeps genuine UNSUPPORTED when no provider error', () => {
      expect(
        normalizeCapabilityStatusForWrite(DrivingCapabilityStatus.UNSUPPORTED, {
          reason: 'signal_not_in_availableSignals',
        }),
      ).toBe(DrivingCapabilityStatus.UNSUPPORTED);
    });

    it('detects provider error metadata variants', () => {
      expect(hasProviderError({ providerErrorCode: '503' })).toBe(true);
      expect(hasProviderError({ providerErrorMessage: 'timeout' })).toBe(true);
      expect(hasProviderError({ reason: 'absent' })).toBe(false);
    });
  });
});
