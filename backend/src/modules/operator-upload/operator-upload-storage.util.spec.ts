import { assertOperatorUploadObjectKeyForOrg, buildOperatorUploadObjectKey } from './operator-upload-storage.util';

describe('operator-upload-storage.util', () => {
  it('builds unpredictable org-scoped keys', () => {
    const key = buildOperatorUploadObjectKey({
      organizationId: 'org-1',
      bookingId: 'booking-1',
      kind: 'DAMAGE_IMAGE',
      now: new Date('2026-07-25T12:00:00.000Z'),
    });
    expect(key).toContain('organizations/org-1/operator-uploads/bookings/booking-1/damage_image/2026/07/');
    expect(key.split('/').pop()).toMatch(/^[0-9a-f-]{36}$/);
    expect(key).not.toContain('..');
  });

  it('rejects cross-tenant object keys', () => {
    expect(() =>
      assertOperatorUploadObjectKeyForOrg(
        'organizations/other-org/operator-uploads/bookings/x/damage_image/2026/07/id',
        'org-1',
      ),
    ).toThrow();
  });
});
