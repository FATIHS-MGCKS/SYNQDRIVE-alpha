import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  parseOffboardRequestBody,
  parseOptionalOffboardNote,
} from '../policy/offboard-request.validation';

describe('parseOffboardRequestBody note (VO5C D5)', () => {
  it('accepts note up to 2000 characters', () => {
    const note = 'a'.repeat(2000);
    expect(parseOptionalOffboardNote(note)).toBe(note);
    const parsed = parseOffboardRequestBody({
      reason: 'OFFBOARD_SOLD',
      idempotencyKey: 'key-1',
      note,
    });
    expect(parsed.note).toBe(note);
  });

  it('rejects note longer than 2000 characters', () => {
    expect(() => parseOptionalOffboardNote('a'.repeat(2001))).toThrow(VehicleOnboardingError);
  });

  it('omits empty trimmed note', () => {
    const parsed = parseOffboardRequestBody({
      reason: 'OFFBOARD_SOLD',
      idempotencyKey: 'key-1',
      note: '   ',
    });
    expect(parsed.note).toBeUndefined();
  });
});
