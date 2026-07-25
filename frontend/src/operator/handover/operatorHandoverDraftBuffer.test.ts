// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearOperatorHandoverDraftBuffer,
  listOperatorHandoverDraftBuffers,
  readOperatorHandoverDraftBuffer,
  writeOperatorHandoverDraftBuffer,
} from './operatorHandoverDraftBuffer';

const ORG = 'org-1';
const BOOKING = 'booking-1';

afterEach(() => {
  sessionStorage.clear();
});

describe('operatorHandoverDraftBuffer', () => {
  it('stores only minimal metadata without sensitive fields', () => {
    writeOperatorHandoverDraftBuffer({
      orgId: ORG,
      bookingId: BOOKING,
      kind: 'PICKUP',
      sessionId: 'session-1',
      version: 3,
      step: 'condition',
      updatedAt: Date.now(),
    });

    const raw = sessionStorage.getItem('sq:operator-handover-draft-buffer');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(
      expect.objectContaining({
        orgId: ORG,
        bookingId: BOOKING,
        kind: 'PICKUP',
        sessionId: 'session-1',
        version: 3,
        step: 'condition',
      }),
    );
    expect(parsed[0]).not.toHaveProperty('form');
    expect(parsed[0]).not.toHaveProperty('signature');
    expect(parsed[0]).not.toHaveProperty('customerSigData');
    expect(parsed[0]).not.toHaveProperty('uploadRefs');
  });

  it('reads and clears entries by booking/kind', () => {
    writeOperatorHandoverDraftBuffer({
      orgId: ORG,
      bookingId: BOOKING,
      kind: 'RETURN',
      sessionId: 'session-2',
      version: 1,
      step: 'vehicle',
      updatedAt: Date.now(),
    });

    const entry = readOperatorHandoverDraftBuffer(ORG, BOOKING, 'RETURN');
    expect(entry?.sessionId).toBe('session-2');

    clearOperatorHandoverDraftBuffer(ORG, BOOKING, 'RETURN');
    expect(readOperatorHandoverDraftBuffer(ORG, BOOKING, 'RETURN')).toBeNull();
    expect(listOperatorHandoverDraftBuffers(ORG)).toHaveLength(0);
  });

  it('expires stale buffer entries', () => {
    sessionStorage.setItem(
      'sq:operator-handover-draft-buffer',
      JSON.stringify([
        {
          orgId: ORG,
          bookingId: BOOKING,
          kind: 'PICKUP',
          sessionId: 'session-old',
          version: 1,
          step: 'vehicle',
          updatedAt: Date.now() - 6 * 60 * 1000,
        },
      ]),
    );

    expect(listOperatorHandoverDraftBuffers(ORG)).toHaveLength(0);
  });
});
