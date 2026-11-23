import { describe, expect, it, vi } from 'vitest';

import { scrollChromeTabControlIntoView } from './chrome-tab-bar';

describe('scrollChromeTabControlIntoView', () => {
  it('scrolls tab control with horizontal center alignment', () => {
    const scrollIntoView = vi.fn();
    const el = { scrollIntoView } as unknown as HTMLElement;

    scrollChromeTabControlIntoView(el);

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center', block: 'nearest' }),
    );
  });

  it('no-ops when element is missing', () => {
    expect(() => scrollChromeTabControlIntoView(null)).not.toThrow();
  });
});