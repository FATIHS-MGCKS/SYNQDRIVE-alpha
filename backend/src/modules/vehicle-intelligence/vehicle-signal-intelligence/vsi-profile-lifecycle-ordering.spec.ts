import {
  shouldApplySourceLinkActivatedEvent,
  shouldApplySourceLinkDeactivatedEvent,
} from './vsi-profile-lifecycle-ordering';

describe('vsi-profile-lifecycle-ordering', () => {
  const activatedAt = new Date('2026-10-15T12:00:00.000Z');
  const deactivatedAt = new Date('2026-10-15T14:00:00.000Z');
  const reactivatedAt = new Date('2026-10-15T16:00:00.000Z');

  it('applies activation when link is active and event is not before activatedAt', () => {
    expect(
      shouldApplySourceLinkActivatedEvent(
        { isActive: true, activatedAt, deactivatedAt: null },
        new Date('2026-10-15T12:00:01.000Z'),
      ),
    ).toBe(true);
  });

  it('skips activation before activatedAt or when link is inactive', () => {
    expect(
      shouldApplySourceLinkActivatedEvent(
        { isActive: true, activatedAt, deactivatedAt: null },
        new Date('2026-10-11T00:00:00.000Z'),
      ),
    ).toBe(false);
    expect(
      shouldApplySourceLinkActivatedEvent(
        { isActive: false, activatedAt, deactivatedAt },
        deactivatedAt,
      ),
    ).toBe(false);
  });

  it('applies deactivation only when link is inactive and event is not stale', () => {
    expect(
      shouldApplySourceLinkDeactivatedEvent(
        { isActive: false, activatedAt, deactivatedAt },
        new Date('2026-10-15T14:00:01.000Z'),
      ),
    ).toBe(true);
  });

  it('skips deactivation while link is active (reactivation wins)', () => {
    expect(
      shouldApplySourceLinkDeactivatedEvent(
        { isActive: true, activatedAt: reactivatedAt, deactivatedAt: null },
        deactivatedAt,
      ),
    ).toBe(false);
  });

  it('skips deactivation event older than authoritative deactivatedAt', () => {
    expect(
      shouldApplySourceLinkDeactivatedEvent(
        { isActive: false, activatedAt, deactivatedAt },
        new Date('2026-10-15T13:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
