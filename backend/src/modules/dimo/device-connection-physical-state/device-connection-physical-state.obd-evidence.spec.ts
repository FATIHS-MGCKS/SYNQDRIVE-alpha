import {
  extractObdPlugSignalEvidenceFromSnapshotPayload,
  extractObdPlugSignalFromSignals,
  extractWebhookObdPhysicalEvidence,
  parseObdPlugValue,
} from './device-connection-physical-state.obd-evidence';

describe('device-connection-physical-state.obd-evidence', () => {
  describe('parseObdPlugValue', () => {
    it('parses boolean, number, and string values', () => {
      expect(parseObdPlugValue(true)).toBe(true);
      expect(parseObdPlugValue(false)).toBe(false);
      expect(parseObdPlugValue(1)).toBe(true);
      expect(parseObdPlugValue(0.4)).toBe(false);
      expect(parseObdPlugValue('true')).toBe(true);
      expect(parseObdPlugValue('0')).toBe(false);
      expect(parseObdPlugValue('invalid')).toBeNull();
    });
  });

  describe('extractObdPlugSignalFromSignals', () => {
    it('uses per-signal timestamp only', () => {
      const result = extractObdPlugSignalFromSignals({
        obdIsPluggedIn: { value: true, timestamp: '2026-09-12T15:02:29.000Z' },
        lastSeen: { timestamp: '2026-09-12T14:00:00.000Z' },
      });
      expect(result).toEqual({
        obdIsPluggedIn: true,
        evidenceObservedAt: new Date('2026-09-12T15:02:29.000Z'),
      });
    });

    it('fails closed when timestamp missing', () => {
      expect(
        extractObdPlugSignalFromSignals({
          obdIsPluggedIn: { value: true },
        }),
      ).toBeNull();
    });

    it('accepts direct boolean with nested timestamp object', () => {
      const result = extractObdPlugSignalFromSignals({
        obdIsPluggedIn: {
          value: '1',
          timestamp: 1_728_000_000_000,
        },
      });
      expect(result?.obdIsPluggedIn).toBe(true);
      expect(result?.evidenceObservedAt).toEqual(new Date(1_728_000_000_000));
    });
  });

  describe('extractObdPlugSignalEvidenceFromSnapshotPayload', () => {
    it('matches live signals extraction semantics', () => {
      const payload = {
        obdIsPluggedIn: { value: false, timestamp: '2026-09-12T16:27:51.000Z' },
      };
      const fromPayload = extractObdPlugSignalEvidenceFromSnapshotPayload(payload);
      const fromSignals = extractObdPlugSignalFromSignals(payload);
      expect(fromPayload).toEqual(fromSignals);
    });
  });

  describe('extractWebhookObdPhysicalEvidence', () => {
    it('uses observedAt as physical ordering timestamp', () => {
      const observedAt = new Date('2026-09-12T16:27:51.000Z');
      const result = extractWebhookObdPhysicalEvidence({
        provider: 'DIMO',
        tokenId: 42,
        pluggedIn: false,
        observedAt,
        evidenceReferenceId: 'wh-1',
      });
      expect(result?.candidateState).toBe('UNPLUGGED');
      expect(result?.evidenceObservedAt).toEqual(observedAt);
      expect(result?.binding.bindingKey).toMatch(/^DIMO:device:/);
    });
  });

  describe('source neutrality', () => {
    it('same timestamp and state produce equivalent candidate regardless of source shape', () => {
      const ts = '2026-09-12T15:02:29.000Z';
      const signal = extractObdPlugSignalFromSignals({
        obdIsPluggedIn: { value: true, timestamp: ts },
      });
      const payload = extractObdPlugSignalEvidenceFromSnapshotPayload({
        obdIsPluggedIn: { value: true, timestamp: ts },
      });
      expect(signal).toEqual(payload);
    });
  });
});
