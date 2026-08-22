import { describe, expect, it } from 'vitest';

import { hasCommunicationPermission } from '../../lib/communication-permissions';

describe('communication center navigation visibility', () => {
  it('shows nav access with communication.read', () => {
    expect(
      hasCommunicationPermission((module, level) => module === 'communication' && level === 'read'),
    ).toBe(true);
  });

  it('hides nav access without communication permission', () => {
    expect(hasCommunicationPermission(() => false, 'read', 'DRIVER')).toBe(false);
  });
});
