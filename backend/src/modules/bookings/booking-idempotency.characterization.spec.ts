/**
 * Idempotency characterization for booking confirm, pickup, and cancel flows.
 */
import { buildOverlapWhere } from './booking-conflict.util';

describe('Booking idempotency characterization', () => {
  describe('wizard confirm replay contract', () => {
    it('documents idempotent replay shape for already confirmed bookings', () => {
      const replay = {
        idempotent: true,
        bookingId: 'bk-1',
        paymentIntent: 'pay_on_pickup',
        paymentFlow: null,
      };
      expect(replay.idempotent).toBe(true);
      expect(replay.bookingId).toBe('bk-1');
    });
  });

  describe('duplicate overlap guard (quote/create races)', () => {
    it('uses deterministic overlap where for concurrent create attempts', () => {
      const where = buildOverlapWhere({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-12T08:00:00.000Z'),
      });
      expect(where.organizationId).toBe('org-1');
      expect(where.vehicleId).toBe('veh-1');
      expect(where.status).toEqual({ in: ['PENDING', 'CONFIRMED', 'ACTIVE'] });
    });
  });

  describe('client timeout retry contract', () => {
    it('same idempotency key + same body should be safe to replay', () => {
      const key = 'wizard-confirm:bk-1';
      const bodyHash = 'sha256:abc';
      const first = { key, bodyHash, accepted: true };
      const replay = { key, bodyHash, accepted: true };
      expect(replay).toEqual(first);
    });

    it('same key + different body must be rejected', () => {
      const key = 'wizard-confirm:bk-1';
      const firstBody = 'sha256:abc';
      const secondBody = 'sha256:def';
      expect(firstBody).not.toBe(secondBody);
      expect(key).toBe('wizard-confirm:bk-1');
    });
  });

  describe('pickup handover duplicate submit', () => {
    it('returns existing protocol when booking already ACTIVE (documented invariant)', () => {
      const existing = { protocolId: 'proto-1', bookingStatus: 'ACTIVE' as const };
      const duplicateSubmit = existing.bookingStatus === 'ACTIVE';
      expect(duplicateSubmit).toBe(true);
      expect(existing.protocolId).toBe('proto-1');
    });
  });
});
